var request = require('request-promise');
var Promise = require('bluebird');
//var async = require('asyncawait/async');
//var await = require('asyncawait/await');

function unoGame(config){
    config = config || {};

    if (!config.storage){
        throw 'No storage method defined';
    }

    if (!config.storage.channels ||
        !config.storage.channels.getAsync ||
        !config.storage.channels.saveAsync){
        throw 'Storage must have channels property with getAsync and saveAsync functions';
    }

    var defaultSendMessage = async function(message, text, isPrivate){
        if (isPrivate){
            await message.respond(text);
        }

        else{
            await message.say(text);
        }

        return message;
    };

    var storage = config.storage,
        suitMappings = config.suitMappings || {'HEARTS': 'red', 'SPADES': 'green', 'CLUBS': 'yellow', 'DIAMONDS': 'blue'},
        valueMappings = config.valueMappings || {'JACK': 'draw 2', 'QUEEN': 'skip', 'KING': 'reverse'},
        sendMessage = config.sendMessage || defaultSendMessage;

    Promise = config.Promise || Promise;

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

    var drawCards = async function(message, game, playerName, count){
        if (!game){
            return;
        }

        try {
            var cardRequest = await request({ uri: 'http://deckofcardsapi.com/api/deck/' + game.deckId + '/draw/?count=' + count, json: true });

            var player = game.players[playerName];
            var cardCount = cardRequest.cards.length;

            for (var j = 0; j < cardCount; j++){
                //var card = getUnoCard({ suit: 'SPADES', value: 'ACE' });
                var card = getUnoCard(cardRequest.cards[j]);
                player.hand.push(card);
            }

            if (cardRequest.remaining <= 10){
                await sendMessage(message, 'Less than 10 cards remaining. Reshuffling the deck.');
                await request({ uri: 'http://deckofcardsapi.com/api/deck/' + game.deckId + '/shuffle/', json: true });
                await sendMessage(message, 'Deck reshuffled.');
            }
        }
        catch (e){
            console.log(e);
            if (!game.players[playerName].isAi) {
                await sendMessage(message, 'Sorry, something happened - I\'ll trade out the deck and try again.', true);
            }
            await getNewDeck(game);
            await drawCards(message, game, playerName, count);
        }
    };

    var endGame = async function(message, game){
        if (!game || !game.started){
            return;
        }

        var winner = game.turnOrder[0],
            points = calculatePoints(game);

        await sendMessage(message, winner + ' played their final card.');
        await sendMessage(message, winner + ' has won the hand, and receives ' + points + ' points.');

        await endTurn(message, game);

        if (game.players[winner].score) {
            game.players[winner].score += points;
        } else {
            game.players[winner].score = points;
        }

        await this.reportScores(message, game);

        var currentScores = [];

        for (var key in game.players){
            var player = game.players[key];
            player.hand = [];
            currentScores.push({Name: key, Score: player.score ? player.score : 0 });
        }

        currentScores.sort(function(a, b){ return b.Score - a.Score; });

        if (currentScores[0].Score >= 500){
            //Player won the game; reset the game to a 'new' state
            var gameWinner = currentScores[0];
            await sendMessage(message, gameWinner.Name + ' has won the game with ' + gameWinner.Score + ' points!');

            game = newGame();
            game.id = message.meta.channel_id;
        } else {
            //Leave the game state, but mark as not started to trigger a new deal
            game.started = false;

            await sendMessage(message, game.player1 + ', type `/uno start` to begin a new hand.');

            if (game.nextGame && game.nextGame.length > 0)
            {
                game.turnOrder = game.turnOrder.concat(game.nextGame);

                for (var i = 0; i < game.nextGame.length; i++){
                    await sendMessage(message, game.nextGame[i] + ' has joined the game.');
                }

                game.nextGame = [];
            }
        }

        await saveGame(game);
    };

    var endTurn = async function(message, game){
        if (!game){
            return;
        }

        if (!game.started){
            await sendMessage(message, 'The game has not yet been started.', true);
            return;
        }

        console.log('Ending turn for ' + game.turnOrder[0]);
        game.turnOrder.push(game.turnOrder.shift());
    };

    var getNewDeck = async function(game){
        var deckRequest = await request({ uri: 'http://deckofcardsapi.com/api/deck/new/shuffle/?deck_count=2', json: true });
        game.deckId = deckRequest.deck_id;
    };

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

    function newGame(){
        return {
            initialized: false,
            started: false,
            players: {},
            deckId: '',
            turnOrder: [],
            nextGame: [],
            currentCard: {}
        };
    }

    var reportCurrentCard = async function(message, game, isPrivate){
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

        await sendMessage(message, msg, isPrivate);
    };

    var saveGame = async function(game){
        try{
            await storage.channels.saveAsync(game);
        } catch (err){
            console.log(err);
        }
    };

    var processAiTurns = async function(message, game){
        var nextPlayer = game.players[game.turnOrder[0]];

        while (nextPlayer.isAi){
            var botBrain = require('../ai/' + nextPlayer.aiName + '.ai.js')({playerName: game.turnOrder[0]});

            await botBrain.play(nextPlayer.hand, game.currentCard,
                    async function(color, value, playerName) { await aiPlay(message, game, color, value, playerName); },
                    async function(playerName) { await aiDraw(message, game, playerName); });

            if (nextPlayer.hand.length === 0){
                await endGame(message, game);
                return;
            }

            nextPlayer = game.players[game.turnOrder[0]];
        }
    };

    var aiPlay = async function(message, game, color, value, aiPlayerName){
        if (!game){
            throw 'No game';
        }

        if (!game.started){
            throw 'Game not yet started';
        }

        var currentPlayer = game.turnOrder[0];

        if (aiPlayerName !== currentPlayer){
            throw 'It is not ' + aiPlayerName + '\'s turn.';
        }

        if (!color || !value){
            throw color + ' ' + value + ' is not a valid play';
        }

        color = color.toLowerCase();
        value = value.toLowerCase();

        var player = game.players[aiPlayerName];

        var selectedCards = player.hand.filter(function(item){ return (item.color === color || item.color === 'wild') && item.value === value; });

        if (selectedCards.length === 0){
            throw 'You don\'t have a ' + color + ' ' + value;
        }

        var cardToPlay = selectedCards[0];

        if (!game.playAnything &&
            cardToPlay.color !== 'wild' &&
            cardToPlay.color !== game.currentCard.color &&
            (game.currentCard.value === 'wild' ||
            game.currentCard.value === 'draw 4' ||
            cardToPlay.value !== game.currentCard.value)){
                throw 'You can\'t play a ' + color + ' ' + value + ' on a ' + game.currentCard.color + ' ' + game.currentCard.value;
        }

        if (game.playAnything){
            game.playAnything = false;
        }

        player.hand.splice(player.hand.indexOf(cardToPlay), 1);

        if (cardToPlay.color === 'wild'){
            cardToPlay.color = color;
        }

        console.log(aiPlayerName + ' selected ' + color + ' ' + value + ' to play.');

        game.currentCard = cardToPlay;


        if (player.hand.length === 1){
            await sendMessage(message, aiPlayerName + ' only has one card left in their hand!');
        } else if (player.hand.length === 0){
            await endGame(message, game);
            return;
        }

        if (cardToPlay.value === 'skip' || (cardToPlay.value === 'reverse' && game.turnOrder.length === 2)){
            await endTurn(message, game);
            await endTurn(message, game);
        } else if (cardToPlay.value === 'reverse'){
            game.turnOrder.reverse();
        } else if (cardToPlay.value === 'draw 2'){
            await endTurn(message, game);
            await drawCards(message, game, game.turnOrder[0], 2);
            await endTurn(message, game);
        } else if (cardToPlay.value === 'draw 4'){
            await endTurn(message, game);
            await drawCards(message, game, game.turnOrder[0], 4);
            await endTurn(message, game);
        } else{
            await endTurn(message, game);
        }

        await saveGame(game);
        await sendMessage(message, aiPlayerName + ' played a ' + color + ' ' + value);
        await this.announceTurn(message, game);
    };

    var aiDraw = async function(message, game, aiPlayerName){
        if (!game){
            return;
        }

        if (!game.started){
            return;
        }

        var currentPlayer = game.turnOrder[0];

        if (aiPlayerName !== currentPlayer){
            return;
        }

        await drawCards(message, game, aiPlayerName, 1);
        await sendMessage(message, aiPlayerName + ' has drawn a card.');
        await saveGame(game);
        return game.players[aiPlayerName].hand;
    };

    this.addAiPlayer = async function(message, game, aiName, botName){
        if (!game){
            return;
        }

        var ai = require('../ai/' + aiName + '.ai.js');
        if (!ai){
            await sendMessage(message, 'Could not find AI ' + aiName, true);
            return;
        }

        var brain = ai();

        if (!brain.play){
            await sendMessage(message, aiName + ' is not a properly-defined AI.', true);
            return;
        }

        botName = botName || brain.preferredName || aiName;

        if (game.turnOrder.indexOf(botName) >= 0 || game.nextGame.indexOf(botName) >= 0){
            await sendMessage(message, 'There is already a player named ' + botName + ' playing the game!', true);
            return;
        }

        if (game.players[botName]){
            if (!game.players[botName].isAi){
                await sendMessage(message, 'There is already a player named ' + botName + ' registered in this game.', true);
                return;
            }
        } else{
            game.players[botName] = {
                hand: [],
                isAi: true,
                aiName: aiName,
                score: 0
            };
        }

        if (game.started){
            game.nextGame.push(botName);
            await sendMessage(message, botName + ' (' + aiName + '.ai) will join the next game.');
        } else{
            game.turnOrder.push(botName);
            await sendMessage(message, botName + ' (' + aiName + '.ai) has joined the game.');
            await this.reportTurnOrder(message, game, true);
        }

        await saveGame(game);
    };

    this.announceTurn = async function(message, game){
        if (!game){
            return;
        }

        await sendMessage(message, {
            "text": 'The current up card is:',
            "attachments": [{
                "color": colorToHex(game.currentCard.color),
                "text": game.currentCard.color + ' ' + game.currentCard.value
            }]
        });
        
        var text = 'It is @' + game.turnOrder[0] + ' \'s turn.';

        if (!game.players[game.turnOrder[0]].isAi)
        {
            text += '\nType `/uno` to begin your turn or `/uno status` at any time to get the state of the game.';
        }

        await sendMessage(message, {
            "text": text,
            "link_names": true
        });
    };

    this.beginGame = async function(message, game){
        if (!game){
            return;
        }

        var user = message.body.user_name;

        if (game.player1 !== user){
            await sendMessage(message, 'Only player 1 (' + game.player1 + ') can start the game.', true);
            return;
        }

        if (Object.keys(game.players).length < 2){
            await sendMessage(message, 'You need at least two players to begin playing.', true);
            return;
        }

        if (game.started){
            await sendMessage(message, 'The game is already started.', true);
            await this.reportTurnOrder(message, game, true);
            return;
        }

        game.started = true;

        await sendMessage(message, 'Game has started! Shuffling the deck and dealing the hands.');

        try {
            await getNewDeck(game);
            for (var playerName in game.players){
                await drawCards(message, game, playerName, 7);
            }

                //draw the starting card as well
            var startingCardRequest = await request({ uri: 'http://deckofcardsapi.com/api/deck/' + game.deckId + '/draw/?count=1', json: true });
            game.currentCard = getUnoCard(startingCardRequest.cards[0]);
            game.playAnything = game.currentCard.color === 'wild';
        } catch (e){
            console.log(e);
            await sendMessage(message, 'An error occurred starting the game.', true);
            return;
        }

        await saveGame(game);
        await this.announceTurn(message, game);
        await this.reportHand(message, game);
        await processAiTurns(message, game);
    };

    this.drawCard = async function(message, game){
        if (!game){
            return;
        }

        var playerName = message.body.user_name || message.body.user.name;

        if (!game.started){
            await sendMessage(message, 'The game has not yet started.', true);
            return;
        }

        var currentPlayer = game.turnOrder[0];

        if (playerName !== currentPlayer){
            await sendMessage(message, 'It is not your turn.', true);
            return;
        }

        await sendMessage(message, 'Drawing card', true);
        await drawCards(message, game, playerName, 1);
        await sendMessage(message, playerName + ' has drawn a card.');

        await saveGame(game);
        //await sendMessage(message, 'You now have ' + game.players[playerName].hand.length + ' cards.', true);
        //await this.reportHand(message, game);
        this.beginTurnInteractive(message, game);
    };

    this.getGame = async function(message, suppressNotice, isInteractive){
        var channel = message.meta.channel_id;

        var game;

        try {
            game = await storage.channels.getAsync(channel);
        } catch (e){
            console.log(e);
            await sendMessage(message, 'There was a problem retrieving the game.', true);
            return undefined;
        }

        if (!game || !game.initialized){
            if (!suppressNotice){
                await sendMessage(message, 'There is no game yet.', true);
            }

            return undefined;
        }

        return game;
    };

    this.initializeGame = async function(message, game){
        var user = message.body.user_name;

        if (game && game.initialized){
            await sendMessage(message, 'There is already an uno game in progress. Type `/uno join` to join the game.', true);
            return;
        }

        game = newGame();
        game.id = message.meta.channel_id;

        game.initialized = true;
        game.player1 = user;
        game.players[user] = {
            hand: [],
            score: 0
        };
        game.turnOrder.push(user);

        await sendMessage(message, user + ' has started UNO. Type `/uno join` to join the game.');

        await saveGame(game);
        await this.reportTurnOrder(message, game, false);
    };

    this.joinGame = async function(message, game, userName){
        var user = userName || message.body.user_name;

        if (!game){
            return;
        }

        if (game.turnOrder.indexOf(user) >= 0 || game.nextGame.indexOf(user) >= 0){
            await sendMessage(message, user + ' has already joined the game!', true);
            return;
        }

        if (!game.players[user]){
            game.players[user] = {
                hand: [],
                score: 0
            };
        } else{
            if (game.players[user].isAi){
                await sendMessage(message, user + ' is an existing AI player. Rename the AI to join.', true);
                return;
            }
        }

        if (game.started){
            game.nextGame.push(user);
            await sendMessage(message, user + ' will join the next game.');
        } else {
            game.turnOrder.push(user);
            await sendMessage(message, user + ' has joined the game.');
            await this.reportTurnOrder(message, game);
        }

        await saveGame(game);
    };

    this.playCard = async function(message, game, color, value){
        var playerName = message.body.user_name || message.body.user.name;

        if (!game){
            return;
        }

        if (!game.started){
            await sendMessage(message, 'The game has not yet been started.', true);
            return;
        }

        var currentPlayer = game.turnOrder[0];

        if (playerName !== currentPlayer){
            await sendMessage(message, 'It is not your turn.', true);
            return;
        }

        if (!color && !value){
            await this.reportHand(message, game);
            return;
        }

        if (!/^(w(ild)?|d(raw ?4?)?)/i.test(color) && !value){
            await sendMessage(message, 'You must specify the value of the card to be played.', true);
            return;
        }

        if (/^d(raw ?4)?/i.test(color)){
            color = 'wild';
            value = 'draw 4';
        } else if (/^w(ild)?/i.test(color)){
            color = 'wild';
            value = 'wild';
        }

        color = color.toLowerCase();
        value = value.toLowerCase();

        color = {'b': 'blue', 'y': 'yellow', 'g': 'green', 'r': 'red'}[color] || color;
        value = {'s': 'skip', 'r': 'reverse', 'draw2': 'draw 2', 'draw': 'draw 2', 'd2': 'draw 2', 'd': 'draw 2'}[value] || value;

        var player = game.players[playerName];

        var selectedCards = player.hand.filter(function(item){ return item.color === color && item.value === value; });

        if (selectedCards.length === 0){
            console.log(color + ' ' + value);
            await sendMessage(message, 'You don\'t have a ' + (color !== 'wild' ? color + ' ' : '') + value, true);
            await this.beginTurnInteractive(message, game);
            return;
        }

        var cardToPlay = selectedCards[0];


        if (!game.playAnything &&
            cardToPlay.color !== 'wild' &&
            cardToPlay.color !== game.currentCard.color &&
            (game.currentCard.value === 'wild' ||
            game.currentCard.value === 'draw 4' ||
            cardToPlay.value !== game.currentCard.value)){
                await sendMessage(message, 'You cannot play a ' + color + ' ' + value + ' on a ' + game.currentCard.color + ' ' + game.currentCard.value, true);
                await this.beginTurnInteractive(message, game);
                return;
        }

        if (game.playAnything){
            game.playAnything = false;
        }

        player.hand.splice(player.hand.indexOf(cardToPlay), 1);
        game.currentCard = cardToPlay;

        if (cardToPlay.color === 'wild'){
            await saveGame(game);
            var chooser = {
                fallback: 'Which color would you like to select?',
                text: 'Which color would you like to select?',
                callback_id: 'color_selection',
                actions: [
                    {name: 'color', text: 'Blue', type: 'button', value: 'blue' },
                    {name: 'color', text: 'Green', type: 'button', value: 'green' },
                    {name: 'color', text: 'Red', type: 'button', value: 'red' },
                    {name: 'color', text: 'Yellow', type: 'button', value: 'yellow' }
                ]
            };

            await this.reportHand(message, game, chooser);
            //TODO: Begin conversation and interactively prompt for color
            /*await sendMessage(message, {
                    text: '',
                    attachments: [
                        {
                            fallback: 'Which color would you like to select?',
                            text: 'Which color would you like to select?',
                            callback_id: 'color_selection',
                            actions: [
                                {name: 'color', text: 'Blue', type: 'button', value: 'blue' },
                                {name: 'color', text: 'Green', type: 'button', value: 'green' },
                                {name: 'color', text: 'Red', type: 'button', value: 'red' },
                                {name: 'color', text: 'Yellow', type: 'button', value: 'yellow' }
                            ]
                        }
                    ]
                }, true);*/
            return;
        }

        await sendMessage(message, 'playing ' + cardToPlay.color + ' ' + cardToPlay.value, true);

        if (player.hand.length === 1){
            await sendMessage(message, playerName + ' only has one card left in their hand!');
        } else if (player.hand.length === 0){
            await endGame(message, game);
            return;
        }

        if (cardToPlay.value === 'skip' || (cardToPlay.value === 'reverse' && game.turnOrder.length === 2)){
            await endTurn(message, game);
            await endTurn(message, game);
        } else if (cardToPlay.value === 'reverse'){
            game.turnOrder.reverse();
        } else if (cardToPlay.value === 'draw 2'){
            await endTurn(message, game);
            await drawCards(message, game, game.turnOrder[0], 2);
            await endTurn(message, game);
        } else{
            await endTurn(message, game);
        }


        await saveGame(game);
        await this.reportHand(message, game);
        await sendMessage(message, playerName + ' played a ' + color + ' ' + value);
        await sendMessage(message, {
            text: '/giphy ' + color + ' ' + value),
            "link_names": true
        };
        await this.announceTurn(message, game);

        if (playerName === game.turnOrder[0]){
            await this.beginTurnInteractive(message, game);
        } else{
            await processAiTurns(message, game);
        }
    };

    this.quitGame = async function(message, game, botName){
        var user = botName || message.body.user_name;

        if (!game){
            return;
        }

        if (game.turnOrder.indexOf(user) < 0){
            await sendMessage(message, user + ' wasn\'t playing to begin with.', true);
            return;
        }

        if (!game.players[user].isAi && user !== message.body.user_name){
            await sendMessage(message, user + ' is not an AI and must leave voluntarily.', true);
            return;
        }

        var activePlayer = game.turnOrder.indexOf(user);
        if (activePlayer >= 0){
            game.turnOrder.splice(activePlayer, 1);
        }

        var nextPlayer = game.nextGame.indexOf(user);
        if (nextPlayer >= 0){
            game.nextGame.splice(nextPlayer, 1);
        }

        await sendMessage(message, user + ' has left the game.');

        if (game.turnOrder.length === 0){
            game = newGame();
            await saveGame(game);
            await sendMessage(message, 'No more players. Ending the game.');
            return;
        }

        var humanPlayers = game.turnOrder.filter(function(item){ return !game.players[item].isAi });

        if (humanPlayers.length === 0){
            game.started = false;
            await saveGame(game);
            await sendMessage(message, 'Only AI players remaining. Waiting for more human players.');
            return;
        }

        if (game.player1 === user){
            game.player1 = humanPlayers[0];
            await sendMessage(message, game.player1 + ' is the new player 1.');
        }

        if (game.turnOrder.length === 1){
            game.started = false;
            await saveGame(game);
            await sendMessage(message, 'Only one player remaining. Waiting for more players.');
            return;
        }

        await saveGame(game);
        await this.reportTurnOrder(message, game);
    };

    this.renameAiPlayer = async function(message, game, oldName, newName){
        if (!game){
            return;
        }

        if (!game.players[oldName]){
            return;
        }

        if (game.players[newName]){
            return;
        }

        if (!game.players[oldName].isAi){
            return;
        }

        game.players[newName] = game.players[oldName];
        delete game.players[oldName];

        if (game.turnOrder.indexOf(oldName) >= 0){
            var idx = game.turnOrder.indexOf(oldName);
            game.turnOrder[idx] = newName;
        }

        if (game.nextGame.indexOf(oldName) >= 0){
            var idx2 = game.nextGame.indexOf(oldName);
            game.nextGame[idx2] = newName;
        }

        await sendMessage(message, 'AI player ' + oldName + ' is now named ' + newName);
    };

    this.reportHand = async function(message, game, additionalAttachments){
        if (!game){
            return;
        }

        var playerName = message.body.user_name || message.body.user.name;


        if (!game.started){
            await sendMessage(message, 'The game has not yet started.', true);
            return;
        }

        var attachments = [];

        var colors = ['Blue', 'Green', 'Red', 'Yellow', 'Wild'];

        var hand = game.players[playerName].hand;
        var isFirst = true;
        var attachment;

        for (var color in colors){
            var handColors = hand.filter(function(item){ return item.color === colors[color].toLowerCase(); });
            if (handColors.length === 0){
                continue;
            }

            for (var card in handColors){
                if (card % 5 === 0){
                    if (attachment) {
                        attachments.push(attachment);
                    }
                    attachment = {
                        color: colorToHex(colors[color].toLowerCase()),
                        callback_id: 'nothing',
                        fallback: "",
                        actions: []
                    };

                    if (isFirst){
                        attachment.pretext = "Your current hand is:";
                        isFirst = false;
                    }
                }

                attachment.actions.push({
                    name: 'card',
                    type: 'button',
                    text: colors[color] + ' ' + handColors[card].value
                });
            }
        }

        attachments.push(attachment);

        if (additionalAttachments){
            attachments.push(additionalAttachments);
        }

        await sendMessage(message, {
            "attachments": attachments
        }, true);
    };

    this.reportScores = async function(message, game, isPrivate){
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

        await sendMessage(message, 'Current score:\n' + stringified, isPrivate);
    };

    this.reportTurnOrder = async function(message, game, isPrivate){
        if (!game){
            return;
        }

        //TODO: Move this somewhere else
        if (game.started && isPrivate){
            await reportCurrentCard(message, game, isPrivate);
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

        await sendMessage(message, 'Current playing order:\n' + currentOrder, isPrivate);

        var waitingPlayers = '';
        for (var i = 0; i < game.nextGame.length; i++){
            if (i > 0){
                waitingPlayers = waitingPlayers + ', ';
            }

            waitingPlayers = waitingPlayers + game.nextGame[i];
        }

        await sendMessage(message, 'Players waiting for the next hand:\n' + waitingPlayers, isPrivate);
    };

    this.resetGame = async function(message, game){
        game = newGame();
        game.id = message.meta.channel_id;
        await saveGame(game);
        await sendMessage(message, 'Game for this channel reset.', true);
    };

    this.setWildColor = async function(message, game, color){
        if (!game){
            return;
        }

        var playerName = message.body.user_name;
        if (message.body.user){
            playerName = message.body.user.name;
        }

        if (!game.started){
            await sendMessage(message, 'The game has not yet been started.', true);
            return;
        }

        var currentPlayer = game.turnOrder[0];

        if (playerName !== currentPlayer)
        {
            await sendMessage(message, 'It is not your turn.', true);
            return;
        }

        if (game.currentCard.color !== 'wild'){
            await sendMessage(message, 'You have\'t played a wild.', true);
            return;
        }


        color = color.toLowerCase();

        color = {'b': 'blue', 'y': 'yellow', 'g': 'green', 'r': 'red'}[color] || color;

        await message.respond(message.body.response_url, {
            text: 'Setting the color to ' + color,
            delete_original: true
        });

        game.currentCard.color = color;

        await sendMessage(message, playerName + ' played a ' + game.currentCard.value + ' and chose ' + color + ' as the new color.');

        await endTurn(message, game);

        if (game.currentCard.value === 'draw 4'){
            await drawCards(message, game, game.turnOrder[0], 4);
            await endTurn(message, game);
        }

        await saveGame(game);
        await this.reportHand(message, game);
        await this.announceTurn(message, game);

        if (playerName === game.turnOrder[0]){
            await this.beginTurnInteractive(message, game);
        } else{
            await processAiTurns(message, game);
        }
    };

    this.beginTurnInteractive = async function(message, game){
        var playerName = message.body.user_name || message.body.user.name;

        if (!game){
            return;
        }

        if (!game.started){
            await sendMessage(message, 'The game has not yet been started.', true);
            return;
        }

        var currentPlayer = game.turnOrder[0];

        if (playerName !== currentPlayer){
            //TODO: This will eventually be handled by showing a limited menu (status mostly)
            await sendMessage(message, 'It is not your turn.', true);
            return;
        }

        var toSend = {
            "text": "What would you like to do?",
            "attachments": [
                {
                    "pretext": "The current up card is:",
                    "color": colorToHex(game.currentCard.color),
                    "text": game.currentCard.color + ' ' + game.currentCard.value
                }
            ],
            "replace_original": false,
            "delete_original": true
        };

        var colors = ['Blue', 'Green', 'Red', 'Yellow', 'Wild'];

        var hand = game.players[playerName].hand;
        var isFirst = true;
        var attachment;


        for (var color in colors){
            var handColors = hand.filter(function(item){ return item.color === colors[color].toLowerCase(); });
            if (handColors.length === 0){
                continue;
            }

            for (var card in handColors){
                if (card % 5 === 0){
                    if (attachment) {
                        toSend.attachments.push(attachment);
                    }
                    attachment = {
                        "color": colorToHex(colors[color].toLowerCase()),
                        "fallback": "You are unable to play a card",
                        "callback_id": "playCard",
                        "actions": []
                    };

                    if (isFirst){
                        attachment.pretext = "Play a card";
                        isFirst = false;
                    }
                }

                var value = handColors[card].color + ' ' + handColors[card].value;
                if (colors[color] === 'Wild'){
                    value = handColors[card].value;
                }

                attachment.actions.push({
                    "name": 'play',
                    "text": colors[color] + ' ' + handColors[card].value,
                    "type": "button",
                    "value": value
                });
            }
        }

        toSend.attachments.push(attachment);
        toSend.attachments.push({
            "fallback": "You were unable to perform the action",
            "callback_id": "other",
            "pretext": "Other Action",
            "actions": [
                {
                    "name": "draw",
                    "text": "Draw a card",
                    "type": "button",
                    "value": "draw"
                },
                {
                    "name": "status",
                    "text": "View game status",
                    "type": "button",
                    "value": "status"
                },
                {
                    "name": "dismiss",
                    "text": "Dismiss",
                    "type": "button",
                    "value": "dismiss"
                }
            ]
        });

        await sendMessage(message, toSend, true);
    };

    return this;
}

module.exports = unoGame;
