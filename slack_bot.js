var Botkit = require('botkit'),
    os = require('os'),
    redis = require('botkit-storage-redis')({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_PASSWORD
    }),
    controller = Botkit.slackbot({
        //debug: true,
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

controller.setupWebserver(PORT, function (err, webserver) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  // Setup our slash command webhook endpoints
  controller.createWebhookEndpoints(webserver);
});

controller.storage.channels.all(function(err, data){
    if (err){
        console.log(err);
        return;
    }
    
    games = data;
    console.log('Games loaded!');
});


//------------Main code begins here-----------------

var games = {},
    suitMappings = {'HEARTS': 'red', 'SPADES': 'green', 'CLUBS': 'yellow', 'DIAMONDS': 'blue'},
    valueMappings = {'JACK': 'draw 2', 'QUEEN': 'skip', 'KING': 'reverse'};

//TODO: Allow for commands via @mentions as well

controller.hears('new', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    getGame({bot, message}, true, initializeGame);
});

controller.hears('reset thisisthepassword', ['slash_command'], function(bot, message){
    getGame({bot, message}, true, resetGame);
});

controller.hears('setup', ['slash_command', 'direct_mention', 'mention'], function(bot, message){
    getGame({bot, message}, false, function(botInfo, game){
        for (var i = 2; i <= 2; i++){
            var mockUser = 'Player' + i;
    
            joinGame(botInfo, game, mockUser);
        }
    });
});

controller.hears('join', ['slash_command', 'direct_mention', 'mention'], function(bot, message){
    getGame({bot, message}, false, joinGame);
});
/*
controller.hears('quit', ['slash_command', 'direct_mention', 'mention'], function(bot, message){
    quitGame(bot, message);
});

controller.hears('status', ['slash_command', 'direct_mention', 'mention'], function(bot, message){
    reportTurnOrder(bot, message, true, false);
});

controller.hears('start', ['slash_command'], function(bot, message){
    beginGame(bot, message);
});

//The following should hear most combinations of cards that can be played
controller.hears('^play(?: (r(?:ed)?|y(?:ellow)?|g(?:reen)?|b(?:lue)?|w(?:ild)?|d(?:raw ?4)?)(?: ?([1-9]|s(?:kip)?|r(?:everse)?|d(?:raw ?2)?))?)?$', ['slash_command'], function(bot, message){
    playCard(bot, message);
});

controller.hears('^color (r(?:ed)?|y(?:ellow)?|g(?:reen)?|b(?:lue)?)', ['slash_command'], function(bot, message){
    setWildColor(bot, message);
});

controller.hears(['draw'], ['slash_command'], function(bot, message){
    drawCard(bot, message);
});

controller.hears(['pass'], ['slash_command'], function(bot, message){
    bot.replyPrivate(message, 'I\'m sorry, I\'m afraid I can\'t do that ' + message.user_name);
});
*/
/*
function playCard(bot, message){
    var game = getGame(bot, message),
        playerName = message.user_name,
        toPlayColor = message.match[1],
        toPlayValue = message.match[2];

    if (!game){
        return;
    }

    if (!game.started){
        bot.replyPrivate(message, 'The game has not yet been started.');
        return;
    }

    var currentPlayer = game.turnOrder[0];

    if (playerName !== currentPlayer){
        bot.replyPrivate(message, 'It is not your turn.');
        return;
    }

    if (!toPlayColor && !toPlayValue){
        reportHand(bot, message);
        bot.replyPrivateDelayed(message, 'You can perform the following actions:\n`/uno play [card]`, `/uno draw`, `/uno view`');
        return;
    }

    if (!/w(ild)?|d(raw ?4)?/i.test(toPlayColor) && !toPlayValue){
        bot.replyPrivate(message, 'You must specify the value of the card to be played.');
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
        bot.replyPrivate(message, 'You don\'t have a ' + (toPlayColor !== 'wild' ? toPlayColor + ' ' : '') + toPlayValue);
        return;
    }

    var cardToPlay = selectedCards[0];


    if (!game.playAnything &&
        cardToPlay.color !== 'wild' && 
        cardToPlay.color !== game.currentCard.color &&
        (game.currentCard.value === 'wild' ||
        game.currentCard.value === 'draw 4' ||         
        cardToPlay.value !== game.currentCard.value)){
            bot.replyPrivate(message, 'You cannot play a ' + toPlayColor + ' ' + toPlayValue + ' on a ' + game.currentCard.color + ' ' + game.currentCard.value);
            return;
    }

    if (game.playAnything){
        game.playAnything = false;
    }

    player.hand.splice(player.hand.indexOf(cardToPlay), 1);
    game.currentCard = cardToPlay;

    if (cardToPlay.color === 'wild'){
        bot.replyPrivate(message, 'Type `/uno color [color]` to specify what the new color should be.');
        return;
    }

    bot.replyPrivate(message, 'playing ' + cardToPlay.color + ' ' + cardToPlay.value);

    if (cardToPlay.value === 'skip'){
        endTurn(bot, message);
        endTurn(bot, message);
    } else if (cardToPlay.value === 'reverse'){
        game.turnOrder.reverse();
    } else if (cardToPlay === 'draw 2'){
        endTurn(bot, message);
        drawCards(bot, message, game.turnOrder[0], 2)
            .then(function(){
                endTurn(bot, message);
            });
    } else{
        endTurn(bot, message);
    }
    
    reportHand(bot, message, true);
    bot.replyPublicDelayed(message, playerName + ' played a ' + toPlayColor + ' ' + toPlayValue);
    announceTurn(bot, message);
}

function setWildColor(bot, message){
        var game = getGame(bot, message),
        playerName = message.user_name,
        newColor = message.match[1];

    if (!game){
        return;
    }

    if (!game.started){
        bot.replyPrivate(message, 'The game has not yet been started.');
        return;
    }

    if (game.currentCard.color !== 'wild'){
        bot.replyPrivate(message, 'You have\'t played a wild.');
    }

    var currentPlayer = game.turnOrder[0];

    if (playerName !== currentPlayer){
        bot.replyPrivate(message, 'It is not your turn.');
        return;
    }

    newColor = newColor.toLowerCase();
    
    newColor = {'b': 'blue', 'y': 'yellow', 'g': 'green', 'r': 'red'}[newColor] || newColor;

    bot.replyPrivate(message, 'Setting the color to ' + newColor);

    game.currentCard.color = newColor;

    bot.replyPublicDelayed(message, playerName + ' played a ' + game.currentCard.value + ' and chose ' + newColor + ' as the new color.');

    endTurn(bot, message);

    if (game.currentCard.value === 'draw 4'){
        drawCards(bot, message, game.turnOrder[0], 4);
        endTurn(bot, message);
    }

    reportHand(bot, message, true);
    announceTurn(bot, message);
}

function endTurn(bot, message){
    var game = getGame(bot, message);

    if (!game){
        return;
    }

    if (!game.started){
        bot.replyPrivate(message, 'The game has not yet been started.');
        return;
    }

    console.log('Ending turn for ' + game.turnOrder[0]);
    game.turnOrder.push(game.turnOrder.shift());
}

function reportHand(bot, message, isDelayed){
    var game = getGame(bot, message),
    playerName = message.user_name;

    if (!game){
        return;
    }

    if (!game.started){
        bot.replyPrivate(message, 'The game has not yet started.');
    }

    var player = game.players[playerName];

    var hand = [];

    for (var i = 0; i < player.hand.length; i++){
        var card = player.hand[i];
        hand.push({
            "color": colorToHex(card.color),
            "text": card.color + ' ' + card.value
        });        
    }

    if (isDelayed)    {
        bot.replyPrivateDelayed(message, {
            "text": 'Your current hand is:',
            "attachments": hand
        });
    }
    else {
        bot.replyPrivate(message, {
            "text": 'Your current hand is:',
            "attachments": hand
        });

    }
}

function beginGame(bot, message){
    var user = message.user_name,
        game = getGame(bot, message);

    if (!game){
        return;
    }

    if (game.player1 !== user){
        bot.replyPrivate(message, 'Only player 1 (' + game.player1 + ') can start the game.');
        return;
    }

    if (Object.keys(game.players).length < 2){
        bot.replyPrivate(message, 'You need at least two players to begin playing.');
        return;
    }

    if (game.started){
        bot.replyPrivate(message, 'The game is already started.');
        reportTurnOrder(bot, message, true, true);
        return;
    }

    game.started = true;
    var drawRequests = [];

    bot.replyPublic(message, 'Game has started! Shuffling the deck and dealing the hands.');

    request({
        uri: 'http://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=2',
        json: true
    }).then(function(result){
        game.deckId = result.deck_id;
    }).then(function(){
        for (var playerName in game.players){
            var drawRequest = drawCards(bot, message, playerName, 7);

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
            announceTurn(bot, message);
            reportHand(bot, message, true);
        });
    });
}

function drawCard(bot, message){
    var game = getGame(bot, message),
        playerName = message.user_name;

    if (!game){
        return;
    }

    if (!game.started){
        bot.replyPrivate(message, 'The game has not yet started.');
        return;
    }

    drawCards(bot, message, playerName, 1)
        .then(function(){
            bot.replyPrivate(message, 'You now have ' + game.players[playerName].hand.length + ' cards.');
            reportHand(bot, message, true);
        });
}

function drawCards(bot, message, playerName, count){
    console.log('Drawing ' + count + ' cards for ' + playerName);
    var game = getGame(bot, message, true);

    if (!game){
        return;
    }

    return request({
        uri: 'http://deckofcardsapi.com/api/deck/' + game.deckId + '/draw/?count=' + count,
        json: true
    }).then(function(result){
        var player = game.players[playerName];
        console.log('Drew ' + result.cards.length + ' cards, adding to ' + playerName + ' hand');
        var cardCount = result.cards.length;

        for (var j = 0; j < cardCount; j++){
            var card = getUnoCard(result.cards[j]);
            player.hand.push(card);
        }

        console.log(playerName + ' hand at ' + player.hand.length + ' cards.');
        console.log(result.remaining + ' cards remaining in the deck.');

        if (result.remaining <= 10){
            bot.replyPublicDelayed(message, 'Less than 10 cards remaining. Reshuffling the deck.');
            request({
                uri: 'http://deckofcardsapi.com/api/deck/' + game.deckId + '/shuffle/',
                json: true
            }).then(function(shuffleResult){
                bot.replyPublicDelayed(message, 'Deck reshuffled.');
            });
        }
    }).catch(function(err){
        console.log(err);
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

function getStandardCard(unoCard){
    
}

function announceTurn(bot, message){
    var game = getGame(bot, message);

    if (!game){
        return;
    }

    bot.replyPublicDelayed(message, {
        "text": 'The current up card is:',
        "attachments": [{            
            "color": colorToHex(game.currentCard.color),
            "text": game.currentCard.color + ' ' + game.currentCard.value        
        }]
    });
    bot.replyPublicDelayed(message, 'It is ' + game.turnOrder[0] + '\'s turn.\nType `/uno play [card]`, `/uno draw` or `/uno status` to begin your turn.');
}

function quitGame(bot, message){
    var user = message.user_name,
        game = getGame(bot, message),
        channel = message.channel;

    if (!game.players[user]){
        bot.replyPrivate(message, 'You weren\'t playing to begin with.');
        return;
    }

    delete game.players[user];

    var player = game.turnOrder.indexOf(user);
    game.turnOrder.splice(player, 1);

    bot.replyPublic(message, user + ' has left the game.');

    if (Object.keys(game.players).length === 0){
        bot.replyPublicDelayed(message, 'No more players. Ending the game.');
        games[channel] = newGame();
        return;
    }

    if (game.player1 === user){        
        game.player1 = Object.keys(game.players)[0];
        bot.replyPublicDelayed(message, game.player1 + ' is the new player 1.');        
    }

    if (Object.keys(game.players).length === 1){
        game.started = false;
        bot.replyPublicDelayed(message, 'Only one player remaining. Waiting for more players.');  
        return;      
    }

    reportTurnOrder(bot, message, false, true);
}
*/

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

function joinGame(botInfo, game, userName){
    var user = userName || botInfo.message.user_name;

    if (!game){
        return;
    }

    if (game.players[user]){
        botInfo.bot.replyPrivate(botInfo.message, user + 'has already joined the game!');
        return;
    }

    game.players[user] = {
        hand: []
    };
    game.turnOrder.push(user);

    botInfo.bot.replyPublic(botInfo.message, user + ' has joined the game.');
    saveGame(botInfo, game);

    reportTurnOrder(botInfo, game, false, true);
}

function getGame(botInfo, suppressNotice, callback){
    var channel = botInfo.message.channel;

    controller.storage.channels.get(channel, function(err, game){
        if (err){
            console.log(err);
            botInfo.bot.replyPrivate(botInfo.message, 'There was a problem retrieving the game.');
            return;
        }
        
        console.log('Game info retrieved:');
        console.log(game);
        
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

function saveGame(botInfo, game){
    console.log('Saving game ' + game.id);
    controller.storage.channels.save(game, function(err){
        if (err){
            console.log('Error saving: ' + err);
            return;
        }
        console.log(game.id + ' saved.');
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

    if (isPrivate){
        botInfo.bot.replyPrivateDelayed(botInfo.message, 'Current playing order:\n' + currentOrder);
    } else {
        botInfo.bot.replyPublicDelayed(botInfo.message, 'Current playing order:\n' + currentOrder);
    }
}

function initializeGame(botInfo, game){
    var user = botInfo.message.user_name;
    console.log('-----initialize');
    console.log(game);

    if (game && game.initialized){
        botInfo.bot.replyPrivate(botInfo.message, 'There is already an uno game in progress. Type `/uno join` to join the game.');
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

    botInfo.bot.replyPublic(botInfo.message, user + ' has started UNO. Type `/uno join` to join the game.');

    saveGame(botInfo, game);

    //reportTurnOrder(bot, message, false, true);
}

function newGame(){
    return {
        initialized: false,
        started: false,
        players: [],
        deckId: '',
        turnOrder: [],
        currentCard: {}
    };
}

function resetGame(botInfo, game){
    game = newGame();
    game.id = botInfo.message.channel;
    botInfo.bot.replyPrivate(botInfo.message, 'Game for this channel reset.');
    saveGame(botInfo, game);
}

/*
controller.hears(['uptime', 'identify yourself', 'who are you', 'what is your name'],
    'direct_message,direct_mention,mention', function(bot, message) {

        var hostname = os.hostname();
        var uptime = formatUptime(process.uptime());

        bot.reply(message,
            ':robot_face: I am a bot named <@' + bot.identity.name +
             '>. I have been running for ' + uptime + ' on ' + hostname + '.');

    });

function formatUptime(uptime) {
    var unit = 'second';
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'minute';
    }
    if (uptime > 60) {
        uptime = uptime / 60;
        unit = 'hour';
    }
    if (uptime != 1) {
        unit = unit + 's';
    }

    uptime = uptime + ' ' + unit;
    return uptime;
}
*/