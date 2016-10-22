/* global expect */
/* global spyOn */
/* global jasmine */
var uno = require('../lib/uno.js');

describe('unoGame', function(){
    beforeEach(function(){
        this.storage = {
            channels: {
                getAsync: jasmine.createSpy('getAsync'),
                saveAsync: jasmine.createSpy('saveAsync')
            }
        };
        this.sendMessage = jasmine.createSpy('sendMessage');
        this.config = {
            storage: this.storage,
            sendMessage: this.sendMessage
        };
        
        this.uno = uno(this.config);
        this.message = {};
        this.game = {
            currentCard:{
                color: 'red',
                value: '8'
            },
            turnOrder: ['player1', 'player2']
        };
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
        
    });
    
    describe('drawCard', function(){
        
    });
    
    describe('getGame', function() {
        
    });
    
    describe('initializeGame', function() {
        
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