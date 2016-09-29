var Botkit = require('botkit'),
    redis = require('botkit-storage-redis')({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_PASSWORD,
        methods: ['hands']
    }),
    controller = Botkit.slackbot({
        storage: redis
    }),
    TOKEN = process.env.SLACK_TOKEN,
    request = require('request-promise'),
    Promise = require('bluebird'),
    PORT = process.env.PORT || 8080,
    VERIFY_TOKEN = process.env.SLACK_VERIFY_TOKEN;

if (TOKEN) {
  console.log('Starting in single-team mode');
  controller.spawn({
    token: TOKEN,
    retry: Infinity
  }).startRTM(function (err, bot, payload) {
    if (err) {
      throw new Error(err);
    }

    console.log('Connected to Slack RTM');
  });
// Otherwise assume multi-team mode - setup beep boop resourcer connection
} else {
  console.log('Starting in Beep Boop multi-team mode');
  require('beepboop-botkit').start(controller, { debug: true });
}

Promise.promisifyAll(controller.storage.channels);
Promise.promisifyAll(controller.storage.users);

controller.setupWebserver(PORT, function (err, webserver) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  // Setup our slash command webhook endpoints
  controller.createWebhookEndpoints(webserver);
});


//------------Main code begins here-----------------

var suitMappings = {'HEARTS': 'red', 'SPADES': 'green', 'CLUBS': 'yellow', 'DIAMONDS': 'blue'},
    valueMappings = {'JACK': 'draw 2', 'QUEEN': 'skip', 'KING': 'reverse'};

//TODO: Allow for commands via @mentions as well

controller.hears('^new', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    getGame({bot, message}, true, initializeGame);
});

//TODO: Remove when done testing (or not)
controller.hears('^reset thisisthepassword$', ['slash_command'], function(bot, message){
    getGame({bot, message}, true, resetGame);
});

controller.hears('^setup', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    getGame({bot, message}, false, function(botInfo, game){
        for (var i = 2; i <= 2; i++){
            var mockUser = 'Player' + i;
    
            joinGame(botInfo, game, mockUser);
        }
    });
});

controller.hears('^join', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    getGame({bot, message}, false, joinGame);
});

controller.hears('^quit', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    getGame({bot, message}, false, quitGame);
});

controller.hears('^status', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    getGame({bot, message}, false, function(botInfo, game){
        reportTurnOrder(botInfo, game, true, false);
    });
});

controller.hears('^start', ['slash_command'], function(bot, message){
    getGame({bot, message}, false, beginGame);
});

//The following should hear most combinations of cards that can be played
controller.hears('^play(?: (r(?:ed)?|y(?:ellow)?|g(?:reen)?|b(?:lue)?|w(?:ild)?|d(?:raw ?4)?)(?: ?([1-9]|s(?:kip)?|r(?:everse)?|d(?:raw ?2)?))?)?$', ['slash_command'], function(bot, message){
    getGame({bot, message}, false, playCard);
});

controller.hears('^color (r(?:ed)?|y(?:ellow)?|g(?:reen)?|b(?:lue)?)', ['slash_command'], function(bot, message){
    getGame({bot, message}, false, setWildColor);
});

controller.hears(['^draw'], ['slash_command'], function(bot, message){
    getGame({bot, message}, false, drawCard);
});

controller.hears(['^pass'], ['slash_command'], function(bot, message){
    bot.replyPrivate(message, 'I\'m sorry, I\'m afraid I can\'t do that ' + message.user_name);
});

controller.hears(['^test$'], ['slash_command'], function(bot, message){
    bot.replyInteractive(message, {
        text: 'Message',
        attachments: [
            {
                title: 'attachment title',
                callback_id: 'test_callback',
                attachment_type: 'default',
                actions: [
                    {
                        name: 'action1name',
                        text: 'action1text',
                        value: 'action1value',
                        type: 'button'
                    },
                    {
                        name: 'action2name',
                        text: 'action2text',
                        value: 'action2value',
                        type: 'button'
                    }]
            }]
    });
});

controller.on('interactive_message_callback', function(bot, message){
    bot.replyPrivateDelayed(message, 'actions: ' + message.actions);
    console.log('callback_id: ' + message.callback_id);
    console.log('Interactive response: ');
    console.log(message);
});


//------- Game code begins here ------------//

function announceTurn(botInfo, game){
    if (!game){
        return;
    }

    sendMessage(botInfo, {
        "text": 'The current up card is:',
        "attachments": [{            
            "color": colorToHex(game.currentCard.color),
            "text": game.currentCard.color + ' ' + game.currentCard.value        
        }]
    }, true);
    
    sendMessage(botInfo, 'It is ' + game.turnOrder[0] + '\'s turn.\nType `/uno play [card]`, `/uno draw` or `/uno status` to begin your turn.', true);
}

function beginGame(botInfo, game){
    if (!game){
        return;
    }

    var user = botInfo.message.user_name;

    if (game.player1 !== user){
        sendMessage(botInfo, 'Only player 1 (' + game.player1 + ') can start the game.', false, true);
        return;
    }

    if (Object.keys(game.players).length < 2){
        sendMessage(botInfo, 'You need at least two players to begin playing.', false, true);
        return;
    }

    if (game.started){
        sendMessage(botInfo, 'The game is already started.', false, true);
        reportTurnOrder(botInfo, game, true, true);
        return;
    }

    game.started = true;
    var drawRequests = [];

    sendMessage(botInfo, 'Game has started! Shuffling the deck and dealing the hands.');

    request({
        uri: 'http://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=2',
        json: true
    }).then(function(result){
        game.deckId = result.deck_id;
    }).then(function(){
        for (var playerName in game.players){
            var drawRequest = drawCards(botInfo, game, playerName, 7);

            drawRequests.push(drawRequest);                    
        }
        
        //draw the starting card as well
        var startingCardRequest = request({
            uri: 'http://deckofcardsapi.com/api/deck/' + game.deckId + '/draw/?count=1',
            json: true
        }).then(function(result){            
            game.currentCard = getUnoCard(result.cards[0]);
            game.playAnything = game.currentCard.color === 'wild';
        });

        drawRequests.push(startingCardRequest);
    }).then(function(){
        Promise.all(drawRequests).then(function(){
            saveGame(botInfo, game).then(function(){
                announceTurn(botInfo, game);
                reportHand(botInfo, game, true);
            });
        });
    });
}

function colorToHex(color){    
    switch(color){
        case 'blue': return '#0033cc';
        case 'red': return '#ff0000';
        case 'green': return '#006633';
        case 'yellow': return '#ffff00';
        case 'wild': return '#000000';
        default: return '';
    }
}

function drawCard(botInfo, game){
    if (!game){
        return;
    }

    var playerName = botInfo.message.user_name;

    if (!game.started){
        sendMessage(botInfo, 'The game has not yet started.', false, true);
        return;
    }

    drawCards(botInfo, game, playerName, 1)
        .then(function(){
            saveGame(botInfo, game).then(function(){
                sendMessage(botInfo, 'You now have ' + game.players[playerName].hand.length + ' cards.', false, true);
                reportHand(botInfo, game, true);
            });
        });
}

function drawCards(botInfo, game, playerName, count){
    if (!game){
        return;
    }

    console.log('Drawing ' + count + ' cards for ' + playerName);

    return request({
        uri: 'http://deckofcardsapi.com/api/deck/' + game.deckId + '/draw/?count=' + count,
        json: true
    }).then(function(result){
        var player = game.players[playerName];
        var cardCount = result.cards.length;

        console.log('Drew ' + cardCount + ' cards, adding to ' + playerName + ' hand');

        for (var j = 0; j < cardCount; j++){
            var card = getUnoCard(result.cards[j]);
            player.hand.push(card);
        }

        console.log(playerName + ' hand at ' + player.hand.length + ' cards.');
        console.log(result.remaining + ' cards remaining in the deck.');

        if (result.remaining <= 10){
            sendMessage(botInfo, 'Less than 10 cards remaining. Reshuffling the deck.', true);
            request({
                uri: 'http://deckofcardsapi.com/api/deck/' + game.deckId + '/shuffle/',
                json: true
            }).then(function(shuffleResult){
                sendMessage(botInfo, 'Deck reshuffled.', true);
            });
        }
    }).catch(function(err){
        console.log(err);
    });
}

function endTurn(botInfo, game){
    if (!game){
        return;
    }

    if (!game.started){
        sendMessage(botInfo, 'The game has not yet been started.', false, true);
        return;
    }

    console.log('Ending turn for ' + game.turnOrder[0]);
    game.turnOrder.push(game.turnOrder.shift());
}

function getGame(botInfo, suppressNotice, callback){
    var channel = botInfo.message.channel;

    controller.storage.channels.get(channel, function(err, game){
        if (err){
            console.log(err);
            botInfo.bot.replyPrivate(botInfo.message, 'There was a problem retrieving the game.');
            return;
        }
        
        console.log('Game info retrieved for ' + channel);
        
        if (!game || !game.initialized){
            if (!suppressNotice){
                botInfo.bot.replyPrivate(botInfo.message, 'There is no game yet.');
            }
            
            console.log('No game or not initialized');
            callback(botInfo, undefined);
            return;
        }
        
        callback(botInfo, game);
    });
}

function getUnoCard(standardCard){
    var value = valueMappings[standardCard.value] || (standardCard.value - 1) + '',
        color = suitMappings[standardCard.suit];

    if (standardCard.value === 'ACE'){
        color = 'wild';
        switch (standardCard.suit){
            case 'CLUBS':
            case 'SPADES':
                value = 'wild';
                break;
            case 'HEARTS':
            case 'DIAMONDS':
                value = 'draw 4';
                break;
        }
    }

    return {
        color: color,
        value: value
    };
}

function initializeGame(botInfo, game){
    var user = botInfo.message.user_name;
    
    if (game && game.initialized){
        sendMessage(botInfo, 'There is already an uno game in progress. Type `/uno join` to join the game.', false, true);
        return;
    }
        
    game = newGame();
    game.id = botInfo.message.channel;

    game.initialized = true;
    game.player1 = user;
    game.players[user] = {
        hand: []
    };
    game.turnOrder.push(user);

    sendMessage(botInfo, user + ' has started UNO. Type `/uno join` to join the game.');

    saveGame(botInfo, game).then(function(){
        reportTurnOrder(botInfo, game, false, true);
    });

}

function joinGame(botInfo, game, userName){
    var user = userName || botInfo.message.user_name;

    if (!game){
        return;
    }

    if (game.players[user]){
        botInfo.bot.replyPrivate(botInfo.message, user + ' has already joined the game!');
        return;
    }

    game.players[user] = {
        hand: []
    };
    game.turnOrder.push(user);

    botInfo.bot.replyPublic(botInfo.message, user + ' has joined the game.');
    
    saveGame(botInfo, game).then(function(){
        reportTurnOrder(botInfo, game, false, true);
    });

}

function newGame(){
    return {
        initialized: false,
        started: false,
        players: {},
        deckId: '',
        turnOrder: [],
        currentCard: {}
    };
}

function playCard(botInfo, game){
    var playerName = botInfo.message.user_name,
        toPlayColor = botInfo.message.match[1],
        toPlayValue = botInfo.message.match[2];

    if (!game){
        return;
    }

    if (!game.started){
        sendMessage(botInfo, 'The game has not yet been started.', false, true);
        return;
    }

    var currentPlayer = game.turnOrder[0];

    if (playerName !== currentPlayer){
        sendMessage(botInfo, 'It is not your turn.', false, true);
        return;
    }

    if (!toPlayColor && !toPlayValue){
        reportHand(botInfo, game);
        sendMessage(botInfo, 'You can perform the following actions:\n`/uno play [card]`, `/uno draw`, `/uno view`', true, true);
        return;
    }

    if (!/w(ild)?|d(raw ?4)?/i.test(toPlayColor) && !toPlayValue){
        sendMessage(botInfo, 'You must specify the value of the card to be played.', false, true);
        return;
    }

    if (/d(raw ?4)?/i.test(toPlayColor)){
        toPlayColor = 'wild';
        toPlayValue = 'draw 4';
    } else if (/w(ild)?/i.test(toPlayColor)){
        toPlayColor = 'wild';
        toPlayValue = 'wild';
    }

    toPlayColor = toPlayColor.toLowerCase();
    toPlayValue = toPlayValue.toLowerCase();

    toPlayColor = {'b': 'blue', 'y': 'yellow', 'g': 'green', 'r': 'red'}[toPlayColor] || toPlayColor;
    toPlayValue = {'s': 'skip', 'r': 'reverse', 'draw2': 'draw 2', 'd': 'draw 2'}[toPlayValue] || toPlayValue;

    var player = game.players[playerName];

    var selectedCards = player.hand.filter(function(item){ return item.color === toPlayColor && item.value === toPlayValue; }); 

    if (selectedCards.length === 0){
        console.log(toPlayColor + ' ' + toPlayValue);
        sendMessage(botInfo, 'You don\'t have a ' + (toPlayColor !== 'wild' ? toPlayColor + ' ' : '') + toPlayValue, false, true);
        return;
    }

    var cardToPlay = selectedCards[0];


    if (!game.playAnything &&
        cardToPlay.color !== 'wild' && 
        cardToPlay.color !== game.currentCard.color &&
        (game.currentCard.value === 'wild' ||
        game.currentCard.value === 'draw 4' ||         
        cardToPlay.value !== game.currentCard.value)){
            sendMessage(botInfo, 'You cannot play a ' + toPlayColor + ' ' + toPlayValue + ' on a ' + game.currentCard.color + ' ' + game.currentCard.value, false, true);
            return;
    }

    if (game.playAnything){
        game.playAnything = false;
    }

    player.hand.splice(player.hand.indexOf(cardToPlay), 1);
    game.currentCard = cardToPlay;

    if (cardToPlay.color === 'wild'){
        saveGame(botInfo, game).then(function(){
            sendMessage(botInfo, 'Type `/uno color [color]` to specify what the new color should be.', false, true);
        });
        return;
    }

    sendMessage(botInfo, 'playing ' + cardToPlay.color + ' ' + cardToPlay.value, false, true);

    var asyncs = [];

    if (cardToPlay.value === 'skip'){
        endTurn(botInfo, game);
        endTurn(botInfo, game);
    } else if (cardToPlay.value === 'reverse'){
        game.turnOrder.reverse();
    } else if (cardToPlay.value === 'draw 2'){
        endTurn(botInfo, game);
        asyncs.push(drawCards(botInfo, game, game.turnOrder[0], 2)
            .then(function(){
                endTurn(botInfo, game);
            }));
    } else{
        endTurn(botInfo, game);
    }
    
    Promise.all(asyncs).then(function(){
        saveGame(botInfo, game).then(function(){
            reportHand(botInfo, game, true);
            sendMessage(botInfo, playerName + ' played a ' + toPlayColor + ' ' + toPlayValue, true);
            announceTurn(botInfo, game);
        });
    });
}

function quitGame(botInfo, game){
    var user = botInfo.message.user_name;
        
    if (!game){
        return;
    }

    if (!game.players[user]){
        sendMessage(botInfo, 'You weren\'t playing to begin with.', false, true);
        return;
    }

    delete game.players[user];

    var player = game.turnOrder.indexOf(user);
    game.turnOrder.splice(player, 1);

    sendMessage(botInfo, user + ' has left the game.');

    if (Object.keys(game.players).length === 0){
        game = newGame();
        saveGame(botInfo, game).then(function(){
            sendMessage(botInfo, 'No more players. Ending the game.', true);
        });
        
        return;
    }

    if (game.player1 === user){        
        game.player1 = Object.keys(game.players)[0];
        sendMessage(botInfo, game.player1 + ' is the new player 1.', true);
    }

    if (Object.keys(game.players).length === 1){
        game.started = false;
        saveGame(botInfo, game).then(function(){
            sendMessage(botInfo, 'Only one player remaining. Waiting for more players.', true);
        });

        return;      
    }

    saveGame(botInfo, game).then(function(){
        reportTurnOrder(botInfo, game, false, true);
    });
}

function reportCurrentCard(botInfo, game, isPrivate, isDelayed){
    if (!game){
        return;
    }

    var msg = {
        "text": 'The current up card is:',
        "attachments": [{            
            "color": colorToHex(game.currentCard.color),
            "text": game.currentCard.color + ' ' + game.currentCard.value        
        }]
    };

    if (isPrivate){
        if (isDelayed){
            botInfo.bot.replyPrivateDelayed(botInfo.message, msg);
            return;
        }

        botInfo.bot.replyPrivate(botInfo.message, msg);
        return;
    }

    if (isDelayed){
        botInfo.bot.replyPublicDelayed(botInfo.message, msg);
        return;
    }

    botInfo.bot.replyPublic(botInfo.message, msg);
}

function reportHand(botInfo, game, isDelayed){
    if (!game){
        return;
    }

    var playerName = botInfo.message.user_name;


    if (!game.started){
        sendMessage(botInfo, 'The game has not yet started.', false, true);
        return;
    }

    var player = game.players[playerName];

    var hand = [];

    for (var i = player.hand.length - 1; i >= 0; i--){
        var card = player.hand[i];
        hand.push({
            "color": colorToHex(card.color),
            "text": card.color + ' ' + card.value
        });        
    }

    sendMessage(botInfo, {
            "text": 'Your current hand is:',
            "attachments": hand
        }, true, isDelayed);
}

function reportTurnOrder(botInfo, game, isPrivate, isDelayed){
    if (!game){
        return;
    }
    
    if (game.started){
        reportCurrentCard(botInfo, game, isPrivate, isDelayed);
    }

    var currentOrder = '';

    for (var i = 1; i < game.turnOrder.length + 1; i++){
        if (i > 1){
            currentOrder = currentOrder + ', ';
        }
        var playerName = game.turnOrder[i - 1],
            cardReport = '';

        if (game.started){
            cardReport = ' (' + game.players[playerName].hand.length + ' cards)';
        }

        currentOrder = currentOrder + '\n' + i + '. ' + playerName + cardReport; 
    }

    sendMessage(botInfo, 'Current playing order:\n' + currentOrder, game.started || isDelayed, isPrivate);
}

function resetGame(botInfo, game){
    game = newGame();
    game.id = botInfo.message.channel;
    saveGame(botInfo, game).then(function(){
        sendMessage(botInfo, 'Game for this channel reset.', false, true);
    });
}

function saveGame(botInfo, game){
    console.log('Saving game ' + game.id);
    
    return controller.storage.channels.saveAsync(game).then(function(){
        console.log(game.id + ' saved.');
    }).catch(function(err){
        return err;
    });
}

function sendMessage(botInfo, message, isDelayed, isPrivate){
    if (isDelayed){
        if (isPrivate){
            botInfo.bot.replyPrivateDelayed(botInfo.message, message);
            return;
        }
        
        botInfo.bot.replyPublicDelayed(botInfo.message, message);
        return;
    }
    
    if (isPrivate){
        botInfo.bot.replyPrivate(botInfo.message, message);
        return;
    }
    
    botInfo.bot.replyPublic(botInfo.message, message);
}

function setWildColor(botInfo, game){
    if (!game){
        return;
    }

    var playerName = botInfo.message.user_name,
    newColor = botInfo.message.match[1];

    if (!game.started){
        sendMessage(botInfo, 'The game has not yet been started.', false, true);
        return;
    }

    if (game.currentCard.color !== 'wild'){
        sendMessage(botInfo, 'You have\'t played a wild.', false, true);
    }

    var currentPlayer = game.turnOrder[0];

    if (playerName !== currentPlayer)
    {
        sendMessage(botInfo, 'It is not your turn.', false, true);
        return;
    }

    newColor = newColor.toLowerCase();
    
    newColor = {'b': 'blue', 'y': 'yellow', 'g': 'green', 'r': 'red'}[newColor] || newColor;

    sendMessage(botInfo, 'Setting the color to ' + newColor, false, true);

    game.currentCard.color = newColor;

    sendMessage(botInfo, playerName + ' played a ' + game.currentCard.value + ' and chose ' + newColor + ' as the new color.', true);

    endTurn(botInfo, game);
    
    var asyncs = [];

    if (game.currentCard.value === 'draw 4'){
        asyncs.push(drawCards(botInfo, game, game.turnOrder[0], 4).then(function(){
            endTurn(botInfo, game);
        }));
    }
    
    Promise.all(asyncs).then(function(){
        saveGame(botInfo, game).then(function(){
            reportHand(botInfo, game, true);
            announceTurn(botInfo, game);
        });
    });

}