//var request = require('request-promise');
//var Promise = require('bluebird');

function basic(){
    this.develop = true;
    
    this.preferredName = "basicAI";
    
    this.play = function(hand, currentCard, play, draw){
        console.log(hand);
        console.log(currentCard);
        /*
            Special cards of the same color
                draw 2
                skip
                reverse
            Any card of the same color
            Any card of the same number (preferring the color that is has the most of)
            A Draw 4, choosing the color it has the most of
            A Wild, choosing the color it has the most of
            Draw
        */
        
        //Play card of the same color
        var handColors = hand.filter(function(item){ return item.color === currentCard.color; });
        
        if (handColors.length > 0){
            if (handColors.filter(function(i) { return i.value === 'draw 2'; }).length > 0){
                play(currentCard.color, 'draw 2');
                return;
            }
            
            if (handColors.filter(function(i) { return i.value === 'skip'; }).length > 0){
                play(currentCard.color, 'skip');
                return;
            }
            
            if (handColors.filter(function(i) { return i.value === 'reverse'; }).length > 0){
                play(currentCard.color, 'reverse');
                return;
            }
            
            play(currentCard.color, handColors[0]);
        }
        
        var handValues = hand.filter(function(item){ return item.value === currentCard.value; });
        
        //play card of the same value, of the color we have the most of
        if (handValues.length > 0){
            var bestColor = {
                color: '',
                count: 0
            };
            
            for (var i = 0; i < handValues.length; i++){
                var count = hand.filter(function(i){ return i.color === handValues[i].color }).length;
                if (count > bestColor.count){
                    bestColor.color = handValues[i].color;
                    bestColor.count = count;
                }
            }
            
            play(bestColor.color, currentCard.value);
            return;
        }
        
        var handWilds = hand.filter(function(item){ return item.color === 'wild'; });
        
        //Play wilds
        if (handWilds > 0){
            var bestColor = {
                color: '',
                count: 0
            };
            
            for (var i = 0; i < hand.length; i++){
                var count = hand.filter(function(i){ return i.color === hand[i].color }).length;
                if (count > bestColor.count){
                    bestColor.color = hand[i].color;
                    bestColor.count = count;
                }
            }
            
            if (handWilds.filter(function(i){ return i.value === 'draw 4'; }).length > 0){
                play(bestColor.color, 'draw 4');
                return;
            }
            
            play(bestColor.color, 'draw');
            return;
        }
        
        draw();
    };
    
    return this;
}

module.exports = basic;
