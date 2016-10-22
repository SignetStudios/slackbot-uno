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
    Promise = require('bluebird');

Promise.promisifyAll(storage.channels);
Promise.promisifyAll(storage.users);

var unoGame = require('./lib/uno.js')({
        storage: storage
    });


//------------Main code begins here-----------------

//TODO: Allow for commands via @mentions as well

slapp.command('/uno', '^new$', (msg) => {
    console.log('NEW');
    unoGame.getGame(msg, true).then(function(game){
        unoGame.initializeGame(msg, game);
    });
});

//The following should hear most combinations of cards that can be played
//TODO: Consider breaking these out into seperate functions for easier debugging
slapp.command('/uno', '^play(?: (r(?:ed)?|y(?:ellow)?|g(?:reen)?|b(?:lue)?|w(?:ild)?|d(?:raw ?4)?)(?: ?([1-9]|s(?:kip)?|r(?:everse)?|d(?:(?:raw ?)?2?)?))?)?$', (msg, text, color, value) => {
    console.log('PLAY');
    unoGame.getGame(msg).then(function(game){
        unoGame.playCard(msg, game, color, value);
    });
});

slapp.command('/uno', '^color (r(?:ed)?|y(?:ellow)?|g(?:reen)?|b(?:lue)?)', (msg, text, color) => {
    console.log('COLOR');
    unoGame.getGame(msg).then(function(game){
        unoGame.setWildColor(msg, game, color);
    });
});

//TODO: Remove when done testing (or not)
slapp.command('/uno', '^reset thisisthepassword$', (msg) => {
    console.log('RESET');
    unoGame.getGame(msg, true).then(function(game){
        unoGame.resetGame(msg, game);
    });
});

slapp.command('/uno', '^setup', (msg) => {
    console.log('SETUP');
    unoGame.getGame(msg).then(function(game){
        for (var i = 2; i <= 2; i++){
            var mockUser = 'Player' + i;
            unoGame.joinGame(msg, game, mockUser);
        }
    });
});

slapp.command('/uno', '^join', (msg) => {
    console.log('JOIN');
    unoGame.getGame(msg).then(function(game){
        unoGame.joinGame(msg, game);
    });
});

slapp.command('/uno', '^quit', (msg) => {
    console.log('QUIT');
    unoGame.getGame(msg).then(function(game){
        unoGame.quitGame(msg, game);
    });
});

slapp.command('/uno', '^status', (m) => {
    console.log('STATUS');
    unoGame.getGame(m).then(function(g){
        unoGame.reportHand(m, g);
        unoGame.reportTurnOrder(m, g, true);
        unoGame.reportScores(m, g, true);
    });
});

slapp.command('/uno', '^start', (m) => {
    console.log('START');
    unoGame.getGame(m).then(function(g){
        unoGame.beginGame(m, g);
    });
});

slapp.command('/uno', '^draw', (m) => {
    console.log('DRAW');
    unoGame.getGame(m).then(function(g){
        unoGame.drawCard(m, g);
    });
});

slapp.command('/uno', '^pass', (m) => {
    m.respond('I\'m sorry, Dave, I\'m afraid I can\'t let you do that.');
});

var server = slapp.attachToExpress(Express());

// start http server
server.listen(port, (err) => {
  if (err) {
    return console.error(err);
  }

  console.log(`Listening on port ${port}`);
})