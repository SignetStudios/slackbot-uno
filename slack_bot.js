const Slapp = require('slapp');
const ConvoStore = require('slapp-convo-beepboop');
const BeepBoopContext = require('slapp-context-beepboop');
const Context = require('./beepboop/context.js');
const Express = require('express');
const db = require('./lib/db.js')();

var port = process.env.PORT || 8080;

var slapp = Slapp({
    convo_store: ConvoStore(),
    context: Context(db),
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

slapp.command('/uno', '^$', async function(msg) {
    //generic entrypoint
    var game = await unoGame.getGame(msg, true);
    unoGame.beginTurnInteractive(msg, game);
});

slapp.command('/uno', '^new$', async function(msg) {
    var game = await unoGame.getGame(msg, true);
    unoGame.initializeGame(msg, game);
});

//The following should hear most combinations of cards that can be played
//TODO: Consider breaking these out into seperate functions for easier debugging
slapp.command('/uno', '^play(?: (r(?:ed)?|y(?:ellow)?|g(?:reen)?|b(?:lue)?|w(?:ild)?|d(?:raw ?4)?)(?: ?([1-9]|s(?:kip)?|r(?:everse)?|d(?:(?:raw ?)?2?)?))?)?$', async function(msg, text, color, value) {
    var game = await unoGame.getGame(msg);
    unoGame.playCard(msg, game, color, value);
});

slapp.command('/uno', '^color (r(?:ed)?|y(?:ellow)?|g(?:reen)?|b(?:lue)?)', async function(msg, text, color) {
    var game = await unoGame.getGame(msg);
    unoGame.setWildColor(msg, game, color);
});

slapp.action('color_selection', 'color', async function(msg, text) {
    var game = await unoGame.getGame(msg);
    unoGame.setWildColor(msg, game, msg.body.actions[0].value);
});

slapp.action('playCard', 'play', async function(msg, text) {
    var game = await unoGame.getGame(msg);
    var selected = text.split(' ');
    unoGame.playCard(msg, game, selected[0].toLowerCase(), selected[1]);
});

slapp.action('other', 'draw', async function(msg, text){
    var game = await unoGame.getGame(msg);
    unoGame.drawCard(msg, game);
});

slapp.action('other', 'status', async function(m, text){
    var g = await unoGame.getGame(m);
    await unoGame.reportHand(m, g);
    await unoGame.reportTurnOrder(m, g, true);
    await unoGame.reportScores(m, g, true);
});

slapp.action('other', 'dismiss', (m, t) => {
    m.respond({
        text: '',
        delete_original: true
    });
});

//TODO: Remove when done testing (or not)
slapp.command('/uno', '^reset thisisthepassword$', async function(msg) {
    var game = await unoGame.getGame(msg, true);
    unoGame.resetGame(msg, game);
});

slapp.command('/uno', '^setup', async function(msg) {
    var game = await unoGame.getGame(msg);
    for (var i = 2; i <= 2; i++){
        var mockUser = 'Player' + i;
        unoGame.joinGame(msg, game, mockUser);
    }
});

slapp.command('/uno', '^join', async function(msg) {
    var game = await unoGame.getGame(msg);
    unoGame.joinGame(msg, game);
});

slapp.command('/uno', '^quit', async function(msg) {
    var game = await unoGame.getGame(msg);
    unoGame.quitGame(msg, game);
});

slapp.command('/uno', '^status', async function(m) {
    var g = await unoGame.getGame(m);
    await unoGame.reportHand(m, g);
    await unoGame.reportTurnOrder(m, g, true);
    await unoGame.reportScores(m, g, true);
});

slapp.command('/uno', '^start', async function(m) {
    var g = await unoGame.getGame(m);
    unoGame.beginGame(m, g);
});

slapp.command('/uno', '^draw', async function(m) {
    var g = await unoGame.getGame(m);
    unoGame.drawCard(m, g);
});

slapp.command('/uno', '^help', async function(m){
    unoGame.reportHelp(m);
});

slapp.command('/uno', '^pass', (m) => {
    m.respond('I\'m sorry, Dave, I\'m afraid I can\'t let you do that.');
});

slapp.command('/uno', '^addbot (.+?)(?: (.+))?$', async function(msg, text, aiName, botName) {
    var game = await unoGame.getGame(msg);
    unoGame.addAiPlayer(msg, game, aiName, botName);
});

slapp.command('/uno', '^removebot (.+)$', async function(msg, text, botName) {
    var game = await unoGame.getGame(msg);
    unoGame.quitGame(msg, game, botName);
});

slapp.command('/uno', '^renamebot (.+?) (.+?)', async function(msg, text, botName, newName) {
    var game = await unoGame.getGame(msg);
    unoGame.renameAiPlayer(msg, game, botName, newName);
});

var server = slapp.attachToExpress(Express());

// start http server
server.listen(port, (err) => {
  if (err) {
    return console.error(err);
  }

  console.log(`Listening on port ${port}`);
})