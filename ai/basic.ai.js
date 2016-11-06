//var request = require('request-promise');
//var Promise = require('bluebird');

function basic(options){

    this.playerName = this.preferredName;

    if (options && options.playerName){
        this.playerName = options.playerName;
    }

    this.develop = false;

    this.preferredName = "basicAI";

    this.play = async function(hand, currentCard, play, draw){
        //return draw(this.playerName);

        if (!await tryPlay(hand, currentCard, play)){
            hand = await draw(this.playerName);
        }
    };

    var tryPlay = async function(hand, currentCard, play){
        //return false;
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
        var handValues = hand.filter(function(item){ return item.value === currentCard.value; });

        /*while (handColors.length === 0 && handValues.length === 0){
            hand = draw();
        }*/

        if (handColors.length > 0){
            if (handColors.filter(function(item) { return item.value === 'draw 2'; }).length > 0){
                await play(currentCard.color, 'draw 2', this.playerName);
                return true;
            }

            if (handColors.filter(function(item) { return item.value === 'skip'; }).length > 0){
                await play(currentCard.color, 'skip', this.playerName);
                return true;
            }

            if (handColors.filter(function(item) { return item.value === 'reverse'; }).length > 0){
                await play(currentCard.color, 'reverse', this.playerName);
                return true;
            }

            await play(currentCard.color, handColors[0].value, this.playerName);
            return true;
        }


        //play card of the same value, of the color we have the most of
        if (handValues.length > 0){
            var bestColor = {
                color: '',
                count: 0
            };

            for (var i = 0; i < handValues.length; i++){
                var count = hand.filter(function(item){ return item.color === handValues[i].color }).length;
                if (count > bestColor.count){
                    bestColor.color = handValues[i].color;
                    bestColor.count = count;
                }
            }

            await play(bestColor.color, currentCard.value, this.playerName);
            return true;
        }

        var handWilds = hand.filter(function(item){ return item.color === 'wild'; });

        //Play wilds
        if (handWilds.length > 0){
            var colors = ['red', 'blue', 'green', 'yellow'];

            var bestColor = {
                color: colors[Math.floor(Math.random() * colors.length)], //Randomly choose a color, in case this is the last card to be played.
                count: 0
            };

            for (var i = 0; i < 4; i++){
                var count = hand.filter(function(item){ return item.color == colors[i]; }).length;
                if (count > bestColor.count){
                    bestColor.color = colors[i];
                    bestColor.count = count;
                }
            }

            if (handWilds.filter(function(item){ return item.value === 'draw 4'; }).length > 0){
                await play(bestColor.color, 'draw 4', this.playerName);
                return true;
            }

            await play(bestColor.color, 'wild', this.playerName);
            return true;
        }

        return false;
    };

    return this;
}

module.exports = basic;
