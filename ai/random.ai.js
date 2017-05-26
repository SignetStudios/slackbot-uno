//var request = require('request-promise');
//var Promise = require('bluebird');

function randomAi(options){

    this.playerName = this.preferredName;

    if (options && options.playerName){
        this.playerName = options.playerName;
    }

    this.develop = false;

    this.preferredName = "randomAI";

    this.play = async function(hand, currentCard, play, draw){
        //return draw(this.playerName);

        if (!await tryPlay(hand, currentCard, play)){
            hand = await draw(this.playerName);
        }
    };

    var tryPlay = async function(hand, currentCard, play){
        //Return true if a card was played
        //Return false if we need to draw a card

        console.log(hand);
        console.log(currentCard);
        /*
            Play order:

            * Play the first eligable card in the hand
              - If it's a wild, choose a random color
            * Draw a card            
        */

        for (var i = 0; i < hand.length; i++){
            var possibleCard = hand[i];

            if (possibleCard.color === 'wild'){
                var colors = ['red', 'blue', 'green', 'yellow'];
                var color = colors[Math.floor(Math.random() * colors.length)], //Randomly choose a color                            

                await play(color, possibleCard.value, this.playerName);
                return true;
            }

            if (possibleCard.color === currentCard.color || possibleCard.value === currentCard.value){
                await play(possibleCard.color, possibleCard.value, this.playerName);
                return true;
            }
        }

        return false;
    };

    return this;
}

module.exports = randomAi;
