[![Build Status](https://travis-ci.org/SignetStudios/slackbot-uno.svg?branch=master)](https://travis-ci.org/SignetStudios/slackbot-uno)
[![Coverage Status](https://coveralls.io/repos/github/SignetStudios/slackbot-uno/badge.svg?branch=master)](https://coveralls.io/github/SignetStudios/slackbot-uno?branch=master)

#Slackbot-Uno
Bringing Uno to Slack.

Slackbot-Uno was inspired by the many Uno bots that tend to be found on various IRC channels around the internet. Not having found much to bring such a bot to Slack (and having a desire to better understand both the Slack API and Node), one was created.

Slackbot-Uno is based on the [Slapp Bot Fremework](https://github.com/BeepBoopHQ/slapp), hosted on [BeepBoop](https://beepboophq.com), with Redis storage provided by [Redis Labs](https://redislabs.com), and game deck generation via [DeckOfCardsApi](http://deckofcardsapi.com).

The bot is interacted mosstly via slash commands (by default as `/uno <command> <args>`). The following commands are exposed by the bot itself:

 - `new`: Begins a new game in the current channel. 
 - `join`: Joins the game in the current channel. If the game has already started, you will instead join the next game when the current game finishes.
 - `quit`: Quits the current game. If you are waiting for the next game to begin, you will not be added to the next game. 
 - `addbot <ai_name> <player_name>`: Adds and AI player with a brain of <ai_name> to the current game. If a <player_name> is given, the player will have that name. Otherwise, it will have the default name for that AI.
 - `removebot <player_name>`: Removes the AI player with the specified name from the current game.
 - `renamebot <player_name> <new_name>`: Renames the AI player to the name specified. The new name must not be the name of another player registered with the game.
 - `play <color> <value>`: Plays the given card. If playing a wild, do not specify the color, just the value (`wild` or `draw 4`). The full color/value can be specified (eg. `red skip`), or a shortened value can be used (eg `g9`, `yd`).
 - `draw`: Draws a card and adds it to your hand.
 - `status`: Displays the current status of the game, including your hand, the current up card, the current game points, and the current turn order.
