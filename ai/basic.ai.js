var request = require('request-promise');
var Promise = require('bluebird');

function basic(){
    this.develop = true;
    
    this.play = function(hand, game){
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
    };
    
    return this;
}

module.exports = basic;
