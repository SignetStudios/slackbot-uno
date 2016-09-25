if (!process.env.token) {
    console.log('Error: Specify token in environment');
    process.exit(1);
}

var Botkit = require('./lib/Botkit.js');
var os = require('os');

var controller = Botkit.slackbot({
    debug: true
});

var bot = controller.spawn({
        token: process.env.token
    }).startRTM();

controller.setupWebserver(process.env.PORT, function(err, webserver) {
  controller.createWebhookEndpoints(controller.webserver, 'PsRh1Hn3lbVjQpYtf3UaLwKH');
});

var games = {};

controller.on('slash_command', function(bot, message){
    console.log(message);

    switch (message.text){
        /*case 'new':
            initializeGame(bot, message);
            break;*/
        case 'join':
            joinGame(bot, MessageEvent); 
            break;
        case 'quit':
            quitGame(bot, message);
            break;
        case 'order':
            reportTurnOrder(bot, message);
            break;
        case 'setup':
            for (var i = 2; i <= 5; i++){
                var mockUser = {
                    user: {
                        name: 'Player' + i
                    }
                };

                joinGame(bot, message, mockUser);
            }
            break;
    }    
});

controller.hears('new', 'slash_command, direct_mention, mention', function(bot, message){
    console.log(message);
    initializeGame(bot, message);
})

/*
controller.hears(['!uno'], ['ambient','direct_message','direct_mention'], function(bot, message){
    operateOnUser(bot, message, function(err, res){
        initializeGame(bot, message, res);
    });
});

controller.hears(['lets play'], ['direct_mention', 'mention'], function(bot, message){
    operateOnUser(bot, message, function(err, res){
        initializeGame(bot, message, res);
    });
});

controller.hears(['!join', 'I\'ll play'], ['ambient', 'direct_message', 'direct_mention'], function(bot, message){
    operateOnUser(bot, message, function(err, res){ 
        joinGame(bot, message, res); 
    });
});

controller.hears(['!quit'], ['ambient','direct_message','direct_mention'], function(bot, message){
    operateOnUser(bot, message, function(err, res){
        quitGame(bot, message, res);
    })
});

controller.hears(['!playOrder'], ['ambient','direct_message','direct_mention'], function(bot, message){
    reportTurnOrder(bot, message);
});

controller.hears(['!setup'], ['direct_message'], function(bot, message){
    console.log(message);

    for (var i = 2; i <= 5; i++){
        var mockUser = {
            user: {
                name: 'Player' + i
            }
        };

        joinGame(bot, message, mockUser);
    }

})
*/

function quitGame(bot, message){
    var user = message.user_name,
        game = getGame(bot, message),
        channel = message.channel;

    if (!game.players[user]){
        bot.replyPrivate(message, 'No problem, ' + user + ', you weren\'t playing to begin with.');
        return;
    }

    delete game.players[user];

    var player = game.turnOrder.indexOf(user);
    game.turnOrder.splice(player, 1);

    bot.replyPublic(message, user + ' has left the game.');

    if (Object.keys(game.players).length === 0){
        bot.replyPublic(message, 'No more players. Ending the game.');
        games[channel] = newGame();
        return;
    }

    if (game.player1 === user){        
        game.player1 = Object.keys(game.players)[0];
        bot.replyPublic(message, game.player1 + ' is the new player 1.');        
    }

    if (game.players.length === 1){
        game.started = false;
        bot.replyPublic(message, 'Only one player remaining. Waiting for more players.');        
    }

    reportTurnOrder(bot, message);
}

function joinGame(bot, message){
    var user = message.user_name,
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
    game.turnOrder[game.turnOrder.length] = user;

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

function reportTurnOrder(bot, message){
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

    bot.replyPrivate(message, 'Current playing order:\n' + currentOrder);
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
    game.turnOrder[game.turnOrder.length] = user;

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

/*
controller.hears(['hello', 'hi'], 'direct_message,direct_mention,mention', function(bot, message) {

    bot.api.reactions.add({
        timestamp: message.ts,
        channel: message.channel,
        name: 'robot_face',
    }, function(err, res) {
        if (err) {
            bot.botkit.log('Failed to add emoji reaction :(', err);
        }
    });


    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Hello ' + user.name + '!!');
        } else {
            bot.reply(message, 'Hello.');
        }
    });
});

controller.hears(['call me (.*)', 'my name is (.*)'], 'direct_message,direct_mention,mention', function(bot, message) {
    var name = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
        if (!user) {
            user = {
                id: message.user,
            };
        }
        user.name = name;
        controller.storage.users.save(user, function(err, id) {
            bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
        });
    });
});

controller.hears(['what is my name', 'who am i'], 'direct_message,direct_mention,mention', function(bot, message) {

    controller.storage.users.get(message.user, function(err, user) {
        if (user && user.name) {
            bot.reply(message, 'Your name is ' + user.name);
        } else {
            bot.startConversation(message, function(err, convo) {
                if (!err) {
                    convo.say('I do not know your name yet!');
                    convo.ask('What should I call you?', function(response, convo) {
                        convo.ask('You want me to call you `' + response.text + '`?', [
                            {
                                pattern: 'yes',
                                callback: function(response, convo) {
                                    // since no further messages are queued after this,
                                    // the conversation will end naturally with status == 'completed'
                                    convo.next();
                                }
                            },
                            {
                                pattern: 'no',
                                callback: function(response, convo) {
                                    // stop the conversation. this will cause it to end with status == 'stopped'
                                    convo.stop();
                                }
                            },
                            {
                                default: true,
                                callback: function(response, convo) {
                                    convo.repeat();
                                    convo.next();
                                }
                            }
                        ]);

                        convo.next();

                    }, {'key': 'nickname'}); // store the results in a field called nickname

                    convo.on('end', function(convo) {
                        if (convo.status == 'completed') {
                            bot.reply(message, 'OK! I will update my dossier...');

                            controller.storage.users.get(message.user, function(err, user) {
                                if (!user) {
                                    user = {
                                        id: message.user,
                                    };
                                }
                                user.name = convo.extractResponse('nickname');
                                controller.storage.users.save(user, function(err, id) {
                                    bot.reply(message, 'Got it. I will call you ' + user.name + ' from now on.');
                                });
                            });



                        } else {
                            // this happens if the conversation ended prematurely for some reason
                            bot.reply(message, 'OK, nevermind!');
                        }
                    });
                }
            });
        }
    });
});

*/
controller.hears(['shutdown'], 'direct_message,direct_mention,mention', function(bot, message) {
    setTimeout(function() {
        process.exit();
    }, 3000);
});


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
