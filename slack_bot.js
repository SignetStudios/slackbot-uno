if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

require('any-promise/register/q');

var Botkit = require('./lib/Botkit.js'),
    os = require('os'),
    controller = Botkit.slackbot({
        //debug: true
    }),
    bot = controller.spawn({
        token: process.env.token
    }).startRTM(),
    Q = require('q'),
    request = require('request-promise-any');

controller.setupWebserver(process.env.PORT, function(err, webserver) {
  controller.createWebhookEndpoints(controller.webserver, 'PsRh1Hn3lbVjQpYtf3UaLwKH');
});

var games = {},
    suitMappings = {'HEARTS': 'red', 'SPADES': 'green', 'CLUBS': 'yellow', 'DIAMONDS': 'blue'},
    valueMappings = {'JACK': 'Draw 2', 'QUEEN': 'Skip', 'KING': 'Reverse'};

//TODO: Allow for commands via @mentions as well

controller.hears('new', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    initializeGame(bot, message);
});

controller.hears('join', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    joinGame(bot, message);
});

controller.hears('quit', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    quitGame(bot, message);
});

controller.hears('order', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    reportTurnOrder(bot, message, true);
});

controller.hears('setup', ['slash_command'/*, 'direct_mention', 'mention'*/], function(bot, message){
    for (var i = 2; i <= 2; i++){
        var mockUser = 'Player' + i;

        joinGame(bot, message, mockUser);
    }
});

controller.hears('start', ['slash_command'], function(bot, message){
    beginGame(bot, message);
});

controller.hears(['cards', 'draw', 'skip', 'play'], function(bot, message){
    bot.replyPrivate(message, 'I\'m sorry, I\'m afraid I can\'t do that ' + message.user_name);
})

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
        for (playerName in game.players){
            var drawRequest = drawCards(bot, message, playerName, 7);

            drawRequests.push(drawRequest);                    
        }
    }).then(function(){
        Q.allSettled(drawRequests).then(function(){
            announceTurn(bot, message);
        })
    });
}

function drawCards(bot, message, playerName, count){
    console.log('Drawing ' + count + ' cards for ' + playerName);
    var game = getGame(bot, message, true);

    return request({
        uri: 'http://deckofcardsapi.com/api/deck/' + game.deckId + '/draw/?count=' + count,
        json: true
    }).then(function(result){
        var player = game.players[playerName];
        console.log('Drew ' + result.cards.length + ' cards, adding to ' + playerName + ' hand');
        var cardCount = result.cards.length;

        for (var j = 0; j < cardCount; j++){
            var card = getUnoCard(result.cards[j])
            player.hand.push(card);
        }
    }).catch(function(err){
        console.log(err);
    });
}

function getUnoCard(standardCard){
    var value = valueMappings[standardCard.value] || (standardCard.value - 1),
        color = suitMappings[standardCard.suit];

    if (standardCard.value === 'ACE'){
        color = 'Wild';
        switch (standardCard.suit){
            case 'CLUBS':
            case 'SPADES':
                value = 'Wild';
                break;
            case 'HEARTS':
            case 'DIAMONDS':
                value = 'Draw 4';
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

    bot.replyPublicDelayed(message, 'It is ' + game.turnOrder[0] + '\'s turn.\nType \\uno cards, \\uno draw, \\uno skip or \\uno play.')
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
    }

    reportTurnOrder(bot, message);
}

function joinGame(bot, message, userName){
    var user = userName || message.user_name,
        channel = message.channel;

    var game = getGame(bot, message);

    if (!game){
        return;
    }

    if (game.players[user]){
        bot.replyPrivate(message, user + ', you\'ve already joined the game!');
        return;
    }

    game.players[user] = {
        hand: []
    };
    game.turnOrder.push(user);

    bot.replyPublic(message, user + ' has joined the game.');

    reportTurnOrder(bot, message);
}

function getGame(bot, message, suppressReport){
    var channel = message.channel;

    if (!games[channel] || !games[channel].initialized){
        if (!suppressReport)
        {
            bot.replyPrivate(message, 'There is no game yet.');
        }
        return undefined;
    }

    return games[channel];
}

function reportTurnOrder(bot, message, isPrivate, isDelayed){
    var game = getGame(bot, message);

    if (!game){
        return;
    }

    var currentOrder = '';

    for (var i = 1; i < game.turnOrder.length + 1; i++){
        if (i > 1){
            currentOrder = currentOrder + ', ';
        }

        currentOrder = currentOrder + '\n' + i + '. ' + game.turnOrder[i - 1]; 
    }

    if (isPrivate){
        if (isDelayed){
            bot.replyPrivateDelayed(message, 'Current playing order:\n' + currentOrder);
        } else{
            bot.replyPrivate(message, 'Current playing order:\n' + currentOrder);
        }        
    }
    else{
        bot.replyPublicDelayed(message, 'Current playing order:\n' + currentOrder);
    }
}

function initializeGame(bot, message){
    var user = message.user_name,
        channel = message.channel;

    var game = getGame(bot, message, true);

    if (!game){
        game = newGame();

        games[channel] = game;
    }

    if (game.initialized){
        bot.replyPrivate(message, 'There is already an uno game in progress. Type !join to join the game.');
        return;
    }
        
    game = newGame();
    games[channel] = game;

    game.initialized = true;
    game.player1 = user;
    game.players[user] = {
        hand: []
    };
    game.turnOrder.push(user);

    bot.replyPublic(message, user + ' has started UNO. Type !join to join the game.');

    reportTurnOrder(bot, message);
};

function newGame(){
    return {
        initialized: false,
        started: false,
        players: [],
        deckId: '',
        turnOrder: []
    };
}

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
