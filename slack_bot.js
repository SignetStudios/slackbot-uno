const Slapp = require('slapp');
const ConvoStore = require('slapp-convo-beepboop');
const BeepBoopContext = require('slapp-context-beepboop');
const Express = require('express');

var port = process.env.PORT || 8080;

var slapp = Slapp({
    convo_store: ConvoStore(),
    context: BeepBoopContext(),
    log: true,
    colors: true
});

var storage = require('botkit-storage-redis')({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_PASSWORD,
        methods: ['hands']
    }),
    request = require('request-promise'),
    Promise = require('bluebird');

Promise.promisifyAll(storage.channels);
Promise.promisifyAll(storage.users);

//------------Main code begins here-----------------

var suitMappings = {'HEARTS': 'red', 'SPADES': 'green', 'CLUBS': 'yellow', 'DIAMONDS': 'blue'},
    valueMappings = {'JACK': 'draw 2', 'QUEEN': 'skip', 'KING': 'reverse'};

//TODO: Allow for commands via @mentions as well

controller.hears('^new', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    var botInfo = {bot, message};
    getGame(botInfo, true).then(function(game){
        initializeGame(botInfo, game);
    });
});

//TODO: Remove when done testing (or not)
controller.hears('^reset thisisthepassword$', ['slash_command'], function(bot, message){
    var botInfo = {bot, message};
    getGame(botInfo, true).then(function(game){
        resetGame(botInfo, game);
    });
});

controller.hears('^setup', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    var botInfo = {bot, message};
    getGame(botInfo).then(function(game){
        for (var i = 2; i <= 2; i++){
            var mockUser = 'Player' + i;
    
            joinGame(botInfo, game, mockUser);
        }
    });
});

controller.hears('^join', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    var botInfo = {bot, message};
    getGame(botInfo).then(function(game){
        joinGame(botInfo, game);
    });
});

controller.hears('^quit', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    var botInfo = {bot, message};
    getGame(botInfo).then(function(game){
        quitGame(botInfo, game);
    });
});

controller.hears('^status', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    var botInfo = {bot, message};
    getGame(botInfo).then(function(game){
        reportHand(botInfo, game);
        reportTurnOrder(botInfo, game, true, true);
        reportScores(botInfo, game, true, true);
    });
});

controller.hears('^start', ['slash_command'], function(bot, message){
    var botInfo = {bot, message};
    getGame(botInfo).then(function(game){
        beginGame(botInfo, game);
    });
});

//The following should hear most combinations of cards that can be played
//TODO: Consider breaking these out into seperate functions for easier debugging
controller.hears('^play(?: (r(?:ed)?|y(?:ellow)?|g(?:reen)?|b(?:lue)?|w(?:ild)?|d(?:raw ?4)?)(?: ?([1-9]|s(?:kip)?|r(?:everse)?|d(?:(?:raw ?)?2?)?))?)?$', ['slash_command'], function(bot, message){
    var botInfo = {bot, message};
    getGame(botInfo).then(function(game){
        playCard(botInfo, game);
    });
});

controller.hears('^color (r(?:ed)?|y(?:ellow)?|g(?:reen)?|b(?:lue)?)', ['slash_command'], function(bot, message){
    var botInfo = {bot, message};
    getGame(botInfo).then(function(game){
        setWildColor(botInfo, game);
    });
});

controller.hears(['^draw'], ['slash_command'], function(bot, message){
    var botInfo = {bot, message};
    getGame(botInfo).then(function(game){
        drawCard(botInfo, game);
    });
});

controller.hears(['^pass'], ['slash_command'], function(bot, message){
    var botInfo = {bot, message};
    sendMessage(botInfo, 'I\'m sorry, I\'m afraid I can\'t do that ' + message.user_name, false, true);
});

controller.hears(['^test$'], ['slash_command'], function(bot, message){
    bot.replyInteractive(message, {
        text: 'What would you like to do?',
        attachments: [
            {
                text: 'Choose an action.',
                callback_id: 'test_callback',
                attachment_type: 'default',
                actions: [
                    {
                        name: 'draw',
                        text: 'draw',
                        value: 'draw',
                        type: 'button'
                    }]
            }]
    });
});


controller.hears(['^draw$'], ['interactive_message_callback'], function(bot, message){
    var botInfo = {bot, message};
    getGame(botInfo, false, true).then(function(game){
        drawCard(botInfo, game);
    });
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

function calculatePoints(game){
    if (!game){
        return 0;
    }

    var pointValues = {'wild': 50, 'draw 4': 50, 'draw 2': 20, 'skip': 20, 'reverse': 20};
    
    var total = 0;
    
    //Assume the first player in the turnOrder is the winner when calculating points
    for (var i = 1; i < game.turnOrder.length; i++){
        var playerName = game.turnOrder[i];
        var player = game.players[playerName];
        console.log('Calculating ' + playerName + ' hand score');
        
        var currentValue = 0;
        
        for (var j = 0; j < player.hand.length; j++){
            var card = player.hand[j];
            var value = pointValues[card.value] || Number(card.value);
            console.log(card.color + ' ' + card.value + ' = ' + value);
            currentValue += isNaN(value) ? 0 : value;
        }
        
        console.log(playerName + ' total: ' + currentValue);
        
        total += currentValue;
    }
    
    console.log('Total points: ' + total);
    
    return total;
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

    sendMessage(botInfo, 'Drawing card', false, true);
    drawCards(botInfo, game, playerName, 1).then(function(){
            sendMessage(botInfo, playerName + ' has drawn a card.', true);
        }).then(function(){
            saveGame(botInfo, game).then(function(){
                sendMessage(botInfo, 'You now have ' + game.players[playerName].hand.length + ' cards.', true, true);
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

function endGame(botInfo, game){
    if (!game){
        return;
    }
    
    var winner = game.turnOrder[0],
        points = calculatePoints(game);
    
    sendMessage(botInfo, winner + ' played their final card.', true);
    sendMessage(botInfo, winner + ' has won the hand, and receives ' + points + ' points.', true);

    endTurn(botInfo, game);
    
    game.players[winner].points += points;
    
    var currentScores = [];
    
    for (var key in Object.keys(game.players)){
        var player = game.players[key];
        player.hand = [];
        currentScores.push({Name: key, Score: player.score ? player.score : 0 });
    }
    
    currentScores.sort(function(a, b){ return b.Score - a.Score; });
    
    reportScores(botInfo, game, false, true);

    if (currentScores[0].Score >= 500){
        //Player won the game; reset the game to a 'new' state
        var gameWinner = currentScores[0];
        sendMessage(botInfo, gameWinner.Name + ' has won the game with ' + gameWinner.Score + ' points!', true);
        
        game = newGame();
        game.id = botInfo.message.channel;
    } else {
        //Leave the game state, but mark as not started to trigger a new deal
        game.started = false;
        
        sendMessage(botInfo, game.player1 + ', type `/uno start` to begin a new hand.', true);
    }
    
    saveGame(botInfo, game);
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

function getGame(botInfo, suppressNotice, isInteractive){
    var channel = botInfo.message.channel;

    return controller.storage.channels.getAsync(channel).then(function(game){
        console.log('Game info retrieved for ' + channel);
        
        if (!game || !game.initialized){
            if (!suppressNotice){
                sendMessage(botInfo, 'There is no game yet.', isInteractive, true);
            }
            
            console.log('No game or not initialized');
            return undefined;
        }
        
        return game;
    }).error(function(err){
        console.log(err);
        sendMessage(botInfo, 'There was a problem retrieving the game.', isInteractive, true);
        return undefined;
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

    if (game.turnOrder.indexOf(user) > 0){
        sendMessage(botInfo, user + ' has already joined the game!', false, true);
        return;
    }

    if (game.players[user]){
        game.players[user].hand = [];
    } else {
        game.players[user] = {
            hand: []
        };
    }

    game.turnOrder.push(user);

    sendMessage(botInfo, user + ' has joined the game.');
    
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

    if (!/^(w(ild)?|d(raw ?4?)?)/i.test(toPlayColor) && !toPlayValue){
        sendMessage(botInfo, 'You must specify the value of the card to be played.', false, true);
        return;
    }

    if (/^d(raw ?4)?/i.test(toPlayColor)){
        toPlayColor = 'wild';
        toPlayValue = 'draw 4';
    } else if (/^w(ild)?/i.test(toPlayColor)){
        toPlayColor = 'wild';
        toPlayValue = 'wild';
    }

    toPlayColor = toPlayColor.toLowerCase();
    toPlayValue = toPlayValue.toLowerCase();

    toPlayColor = {'b': 'blue', 'y': 'yellow', 'g': 'green', 'r': 'red'}[toPlayColor] || toPlayColor;
    toPlayValue = {'s': 'skip', 'r': 'reverse', 'draw2': 'draw 2', 'draw': 'draw 2', 'd2': 'draw 2', 'd': 'draw 2'}[toPlayValue] || toPlayValue;

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
    
    if (player.hand.length === 1){
        sendMessage(botInfo, playerName + ' only has one card left in their hand!', true);
    } else if (player.hand.length === 0){
        endGame(botInfo, game);
        return;
    }


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

/*
    //Don't delete the player info, so they still show up on the score list
    //Just remove them from the current turn order.
    if (!game.players[user].score)
    {
        //Keep the user around if they have a score
        delete game.players[user];
    }
*/

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

    sendMessage(botInfo, msg, isDelayed, isPrivate);
}

function reportHand(botInfo, game, isDelayed){
    if (!game){
        return;
    }

    var playerName = botInfo.message.user_name;


    if (!game.started){
        sendMessage(botInfo, 'The game has not yet started.', isDelayed, true);
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
        }, isDelayed, true);
}

function reportScores(botInfo, game, isPrivate, isDelayed){
    if (!game){
        return;
    }
    
    var currentScores = [];
    
    var players = Object.keys(game.players);
    
    for (var i = 0; i < players.length; i++){
        var key = players[i];
        var player = game.players[key];
        player.hand = [];
        currentScores.push({Name: key, Score: player.score ? player.score : 0 });
    }
    
    currentScores.sort(function(a, b){ return b.Score - a.Score; });

    var stringified = '';
    
    for(var j = 0; j < currentScores.length; j++){
        stringified += '\n' + currentScores[j].Name + ': ' + currentScores[j].Score;
    }
    
    sendMessage(botInfo, 'Current score:\n' + stringified, isDelayed, isPrivate);
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
    var msg = message;
    
    if (botInfo.message.callback_id){
        if (msg.text){
            msg.attachments = message.attachments || [];
            
            if (msg.attachments.length === 0){
                msg.attachments.push({
                    callback_id: botInfo.message.callback_id
                });
            } else{
                msg.attachments.forEach(function(c){
                    c.callback_id = botInfo.message.callback_id;
                });
            }
        } else {
            msg = {
                text: message,
                attachments: [
                    {
                        callback_id: botInfo.message.callback_id
                    }]
            };
        }
    }
    
    if (isDelayed){
        if (isPrivate){
            botInfo.bot.replyPrivateDelayed(botInfo.message, msg);
            return;
        }
        
        botInfo.bot.replyPublicDelayed(botInfo.message, msg);
        return;
    }
    
    if (isPrivate){
        botInfo.bot.replyPrivate(botInfo.message, msg);
        return;
    }
    
    botInfo.bot.replyPublic(botInfo.message, msg);
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

// attach Slapp to express server
var server = slapp.attachToExpress(Express())

// start http server
server.listen(port, (err) => {
  if (err) {
    return console.error(err)
  }

  console.log(`Listening on port ${port}`)
})