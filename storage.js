var Store = require('beepboop-persist');

module.exports = function(config) {

    if (!config) {
        config = {};
    }

    var db = new Store(config);

    var objectsToList = function(cb) {
        return function(err, data) {
            if (err) {
                cb(err, data);
            } else {
                cb(err, Object.keys(data).map(function(key) {
                    return data[key];
                }));
            }
        };
    };

    var storage = {
        teams: {
            get: function(team_id, cb) {
                db.get('teams/' + team_id, cb);
            },
            save: function(team_data, cb) {
                db.set('teams/' + team_data.id, team_data, cb);
            }/*,
            all: function(cb) {
                teams_db.all(objectsToList(cb));
            }*/
        },
        users: {
            get: function(user_id, cb) {
                db.get('users/' + user_id, cb);
            },
            save: function(user, cb) {
                db.set('users/' + user.id, user, cb);
            }/*,
            all: function(cb) {
                users_db.all(objectsToList(cb));
            }*/
        },
        channels: {
            get: function(channel_id, cb) {
                db.get('channels/' + channel_id, cb);
            },
            save: function(channel, cb) {
                db.set('channels/' + channel.id, channel, cb);
            }/*,
            all: function(cb) {
                channels_db.all(objectsToList(cb));
            }*/
        }
    };

    return storage;
};