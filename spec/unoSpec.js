/* global expect */
/* global spyOn */
/* global jasmine */
var uno = require('../lib/uno.js');
var nock = require('nock');
var Promise = require('bluebird');

describe('unoGame', function(){
    beforeEach(function(){
        this.promise = require('bluebird');
        this.game = {
            id: 'gameId',
            currentCard:{
                color: 'red',
                value: '8'
            },
            turnOrder: ['player1', 'player2'],
            player1: 'player1',
            players: {
                player1: {
                    hand: []
                },
                player2: {
                    hand: []
                }
            }
        };
        this.savedGame = JSON.parse(JSON.stringify(this.game));
        var self = this;
        this.storage = {
            channels: {
                get: jasmine.createSpy('get').andCallFake(function(id, cb){ cb('', self.savedGame); }),
                save: jasmine.createSpy('save').andCallFake(function(obj, cb){ self.savedGame = obj; cb(); })
            }
        };
        
        Promise.promisifyAll(this.storage.channels);
        
        this.sendMessage = jasmine.createSpy('sendMessage');
        this.config = {
            storage: this.storage,
            sendMessage: this.sendMessage,
            Promise: this.promise
        };
        
        this.uno = uno(this.config);
        this.message = {
            body: {},
            meta: {}
        };
    });
    
    describe('storage tests', function(){
        it('gets correctly', function(done){
            this.game = {id: 'id'};
            this.savedGame = {id2: 'id2'};
            var self = this;
            
            this.storage.channels.getAsync('').then(function(a){
                expect(a).toBe(self.savedGame);
                done();
            });
        });
        
        it('saves correctly', function(done){
            this.game = {id: 'id'};
            this.savedGame = {id2: 'id2'};
            var self = this;
            
            this.storage.channels.saveAsync(this.game).then(function(a){
                expect(self.savedGame).toBe(self.game);
                done();
            });
        });
    });
    
    describe('announceTurn', function(){
        it('should do nothing if there is no game', function(){
            //Arrange
            
            //Act
            this.uno.announceTurn(this.message, undefined);
            
            //Assert
            expect(this.sendMessage).not.toHaveBeenCalled();
        });
        
        it('should announce the current up card', function(){
            //Arrange
            
            //Act
            this.uno.announceTurn(this.message, this.game);
            
            //Assert
            expect(this.sendMessage.calls.length).toBeGreaterThan(0);
            expect(this.sendMessage).toHaveBeenCalledWith(this.message, {
                text: 'The current up card is:',
                attachments: [{
                    color: '#ff0000',
                    text: 'red 8'
                }]
            });
        });
        
        it('should announce the current player', function(){
            //Arrange
            
            //Act
            this.uno.announceTurn(this.message, this.game);
            
            //Assert
            expect(this.sendMessage.calls.length).toBeGreaterThan(0);
            expect(this.sendMessage).toHaveBeenCalledWith(this.message, 'It is player1\'s turn.\nType `/uno play [card]`, `/uno draw` or `/uno status` to begin your turn.');
        });
    });
    
    describe('beginGame', function(){
        beforeEach(function(){
            this.httpScope = nock('http://deckofcardsapi.com')
                .get('/api/deck/deckid').reply(200)
                .get('/api/deck/deckid').reply(200)
                .get('/api/deck/new/shuffle/').query({deck_count: '2'}).reply(200, {success: true, deck_id: "deckid", remaining: 104})
                .get('/api/deck/deckid/draw/').query({count: '1'}).reply(200, {success: true, cards: [{suit: "DIAMONDS", value: "ACE", code: "AD"}]})
                .get('/api/deck/deckid/draw/').query({count: '7'}).reply(200, {success: true, remaining: 100, cards: [{suit: "DIAMONDS", value: "ACE", code: "AD"},{suit: "DIAMONDS", value: "ACE", code: "AD"},{suit: "DIAMONDS", value: "ACE", code: "AD"},{suit: "DIAMONDS", value: "ACE", code: "AD"},{suit: "DIAMONDS", value: "ACE", code: "AD"},{suit: "DIAMONDS", value: "ACE", code: "AD"},{suit: "DIAMONDS", value: "ACE", code: "AD"}]})
                .get('/api/deck/deckid/draw/').query({count: '7'}).reply(200, {success: true, remaining: 100, cards: [{suit: "DIAMONDS", value: "ACE", code: "AD"},{suit: "DIAMONDS", value: "ACE", code: "AD"},{suit: "DIAMONDS", value: "ACE", code: "AD"},{suit: "DIAMONDS", value: "ACE", code: "AD"},{suit: "DIAMONDS", value: "ACE", code: "AD"},{suit: "DIAMONDS", value: "ACE", code: "AD"},{suit: "DIAMONDS", value: "ACE", code: "AD"}]});
        });
        
        it('should do nothing if there is no game', function(){
            //Arrange
            this.originalGame = JSON.parse(JSON.stringify(this.game));
            
            //Act
            this.uno.beginGame(this.message, undefined);
            
            //Assert
            expect(this.sendMessage).not.toHaveBeenCalled();
            expect(this.game).toEqual(this.originalGame);
        });
        
        it('should send a message and do nothing if the player is not player 1', function(){
             //Arrange
             this.originalGame = JSON.parse(JSON.stringify(this.game));
             this.message.body.user_name = 'player2';
             
             //Act
             this.uno.beginGame(this.message, this.game);
             
             //Assert
             expect(this.sendMessage).toHaveBeenCalledWith(this.message, 'Only player 1 (player1) can start the game.', true);
             expect(this.game).toEqual(this.originalGame);
        });
        
        it('should send a message and do nothing if there are less than 2 players', function(){
             //Arrange
             delete this.game.players.player2;

             this.originalGame = JSON.parse(JSON.stringify(this.game));
             this.message.body.user_name = 'player1';

             //Act
             this.uno.beginGame(this.message, this.game);
             
             //Assert
             expect(this.sendMessage).toHaveBeenCalledWith(this.message, 'You need at least two players to begin playing.', true);
             expect(this.game).toEqual(this.originalGame);
        });
        
        it('should send a message and do nothing if the game is already started', function(){
             //Arrange
             spyOn(this.uno, 'reportTurnOrder');
             this.game.started = true;

             this.originalGame = JSON.parse(JSON.stringify(this.game));
             this.message.body.user_name = 'player1';

             //Act
             this.uno.beginGame(this.message, this.game);
             
             //Assert
             expect(this.sendMessage).toHaveBeenCalledWith(this.message, 'The game is already started.', true);
             expect(this.game).toEqual(this.originalGame);
        });
        
        it('should report the current turn order if the game is already started', function(){
             //Arrange
             spyOn(this.uno, 'reportTurnOrder');
             this.game.started = true;

             this.originalGame = JSON.parse(JSON.stringify(this.game));
             this.message.body.user_name = 'player1';

             //Act
             this.uno.beginGame(this.message, this.game);
             
             //Assert
             expect(this.uno.reportTurnOrder).toHaveBeenCalledWith(this.message, this.game, true);
             expect(this.game).toEqual(this.originalGame);
        });
        
        it('marks the game as started', function(done){
            //Arrange
            this.message.body.user_name = 'player1';
            
            
            //Act
            this.uno.beginGame(this.message, this.game).then(done());
            
            //Assert
            expect(this.game.started).toEqual(true);
        });
        
        it('broadcasts a message that the game has started', function(done){
            //Arrange
            this.message.body.user_name = 'player1';
            
            
            //Act
            this.uno.beginGame(this.message, this.game).then(done());
            
            //Assert
            expect(this.sendMessage).toHaveBeenCalledWith(this.message, 'Game has started! Shuffling the deck and dealing the hands.');
        });
        
        it('gives each player 7 cards', function(done){
            //Arrange
            this.message.body.user_name = 'player1';
            var self = this;
            
            //Act
            this.uno.beginGame(this.message, this.game).then(function(){
                //Assert
                for (var player in self.game.players){
                    expect(self.game.players[player].hand.length).toEqual(7);
                }
                done();
            });
        });
        
        it('announces the turn information', function(done){
            //Arrange
            this.message.body.user_name = 'player1';
            spyOn(this.uno, 'announceTurn');
            var self = this;
            
            //Act
            this.uno.beginGame(this.message, this.game).then(function(){
                //Assert
                expect(self.uno.announceTurn).toHaveBeenCalledWith(self.message, self.game);
                done();
            });
        });
        
        it('tells player1 their hand', function(done){
            //Arrange
            this.message.body.user_name = 'player1';
            spyOn(this.uno, 'reportHand');
            var self = this;
            
            //Act
            this.uno.beginGame(this.message, this.game).then(function(){
                //Assert
                expect(self.uno.reportHand).toHaveBeenCalledWith(self.message, self.game);
                done();
            });
        });
    });
    
    describe('drawCard', function(){
        
        it('should do nothing if there is no game', function(){
            //Arrange
            this.originalGame = JSON.parse(JSON.stringify(this.game));
            
            //Act
            this.uno.drawCard(this.message, undefined);
            
            //Assert
            expect(this.sendMessage).not.toHaveBeenCalled();
            expect(this.game).toEqual(this.originalGame);
        });
        
        it('should send a message and do nothing if the game is not started', function(){
             //Arrange
             this.game.started = false;

             this.originalGame = JSON.parse(JSON.stringify(this.game));

             //Act
             this.uno.drawCard(this.message, this.game);
             
             //Assert
             expect(this.sendMessage).toHaveBeenCalledWith(this.message, 'The game has not yet started.', true);
             expect(this.game).toEqual(this.originalGame);
        });
        
        it('should send a message and do nothing if the game is not started', function(){
             //Arrange
             this.game.started = false;

             this.originalGame = JSON.parse(JSON.stringify(this.game));

             //Act
             this.uno.drawCard(this.message, this.game);
             
             //Assert
             expect(this.sendMessage).toHaveBeenCalledWith(this.message, 'The game has not yet started.', true);
             expect(this.game).toEqual(this.originalGame);
        });
        
        it('should increase the hand size of the player by 1', function(done){
            //Arrange
            var self = this;
            this.game.started = true;
            this.message.body.user_name = 'player1';
            
            //Act
            this.uno.drawCard(this.message, this.game).then(function(){
                //Assert
                expect(self.game.players.player1.hand.length).toBe(1);
                done();
            });
        });
        
        it('should tell the player their new hand', function(done){
            //Arrange
            var self = this;
            this.game.started = true;
            this.message.body.user_name = 'player1';
            spyOn(this.uno, 'reportHand');
            
            //Act
            this.uno.drawCard(this.message, this.game).then(function(){
                //Assert
                expect(self.sendMessage).toHaveBeenCalledWith(self.message, 'You now have 1 cards.', true);
                expect(self.uno.reportHand).toHaveBeenCalledWith(self.message, self.game);
                done();
            });
        });
    });
    
    describe('getGame', function() {
        it('gets the game state from storage', function(done){
            //Arrange
            this.message.meta.channel_id = 'channel';
            this.savedGame.initialized = true;
            var self = this;

            //Act
            this.uno.getGame(this.message).then(function(game){
                //Assert
                expect(self.storage.channels.get).toHaveBeenCalledWith('channel', jasmine.any(Function));
                expect(game).toBe(self.savedGame);
                done();
            });
        });
        
        it('sends a message and an empty object if the game is not initialized', function(done){
            //Arrange
            this.message.meta.channel_id = 'channel';
            var self = this;
            
            //Act
            this.uno.getGame(this.message).then(function(game){
                expect(game).not.toBeDefined();
                expect(self.sendMessage).toHaveBeenCalledWith(self.message, 'There is no game yet.', true);
                done();
            });
        });
        
        it('does not send the message if suppressNotice is true', function(done){
            //Arrange
            this.message.meta.channel_id = 'channel';
            var self = this;
            
            //Act
            this.uno.getGame(this.message, true).then(function(game){
                expect(game).not.toBeDefined();
                expect(self.sendMessage).not.toHaveBeenCalled();
                done();
            });
        });
    });
    
    describe('initializeGame', function() {
        it('should report and do nothing if the game is already initialized', function(){
            this.game.initialized = true;
            this.savedGame = JSON.parse(JSON.stringify(this.game));
            
            
            this.uno.initializeGame(this.message, this.game);
            
            expect(this.sendMessage).toHaveBeenCalledWith(this.message, 'There is already an uno game in progress. Type `/uno join` to join the game.', true);
            expect(this.game).toEqual(this.savedGame);
        });
        
        xit('should create a new game state', function(){
            this.game.initialized = false;
            this.message.meta.channel_id = 'channel';
            
            this.uno.initializeGame(this.message, this.game);
            
            expect(this.game).toEqual({
                id: 'channel',
                initialized: true,
                started: false,
                players: {},
                deckId: '',
                turnOrder: [],
                currentCard: {}
            });
        });
        
        it('should set the requesting player to player1', function(){
            
        });
        
        it('should automatically add the requesting user as a player', function(){
            
        });
        
        it('should broadcast that a new game has been started', function(){
            
        });
    });
    
    describe('joinGame', function() {
        
    });
    
    describe('playCard', function() {
        
    });
    
    describe('quitGame', function() {
        
    });
    
    describe('reportHand', function() {
        
    });
    
    describe('reportScores', function() {
        
    });
    
    describe('reportTurnOrder', function() {
        
    });
    
    describe('resetGame', function() {
        
    });
    
    describe('setWildColor', function() {
        
    });
    
});