const express = require('express')
const app = express()
const path = require('path')
const mysql = require('mysql')
const dateFormat = require('dateformat');
const shortid = require('shortid');

const APP_PORT = 5555

// Database
const dbConf = require('./config/db.js')
const db = mysql.createConnection(dbConf)

// Connect Database
db.connect((err) => {
  if (err) {
    console.log(err);
    console.log("Database not connected."); 
  } else {
    console.log("Database connected!");
  }
})

const server = app.listen(APP_PORT, () => {
  console.log(`App running on port ${APP_PORT}`)
})

const io = require('socket.io').listen(server);

function getTimeStamp() {
  let now = new Date();
  let output = dateFormat(now, "yyyy-mm-dd hh:MM:ss.l");
  return output;
}

/// View Engine
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'pug')

// Set Public Static Directory
app.use(express.static('public'));

// Router
app.get('/', (req, res) => {
  res.render('index')
})


users = []
io.on('connection', (socket) => {
  console.log('a user connected')

  socket.on('login', (data) => {
    console.log(getTimeStamp(), " user ", socket.uid, " login");
    if (users.includes(data.uid)) {
      socket.emit('alreadySignedIn');
      socket.disconnect(true);
    } else {
      socket.uid = parseInt(data.uid);
      socket.emit('loggedIn');
      users.push(data.uid);
    }
  })

  /* Get Message that is not read by this user 
   * @param limit (optional, default 100) limit max messages returned by this call
  */
 /*
  socket.on('getUnreadMessages', (data) => {
    console.log(getTimeStamp(), " user ", socket.uid, " getUnreadMessages");
    
    // Find most recent logout time of user 
    let historyQuery = "SELECT ul.logouttime " +
                       "FROM   users_logout ul " +
                       "WHERE  ul.uid = ? " +
                       "ORDER BY ul.logouttime DESC " +
                       "LIMIT 1; ";
    
    data.limit = data.limit || 100;

    db.query(historyQuery, socket.uid, (err, user_history) => {
      if (err) {
        throw err;
      }
      
      console.log(user_history);

      // Callback used for all cases below 
      let callback = (err, newMessages) => {
        if (err) {
          throw err;
        }
        // use 'socket' instead of 'io' to send only to target user 
        socket.emit('receiveUnreadMessages', newMessages)
      }

      if (!user_history[0] ) {
        let newMessageQuery = "SELECT m.uid, m.gid, m.message, m.time " +
                              "FROM   messages m " + 
                              "LIMIT ?;";
        db.query(newMessageQuery, data.limit, allback);
      } else {

        // Find all new chat message for user 
        let newMessageQuery = "SELECT m.uid, m.gid, m.message, m.time " +
                              "FROM   messages m " +
                              "WHERE  m.time >= ? " +
                              "LIMIT ?;";
        db.query(newMessageQuery, [user_history[0].logouttime, data.limit], callback);
      }
    })
  })
  */

  /* Get All Messages
   * @param limit (optional, default 100) limit max messages returned by this call
  */
  socket.on('getPreviousMessages', (data) => {
    console.log(getTimeStamp(), " user ", socket.uid, " getReadMessages");
    
    /* Find most recent logout time of user */
    let historyQuery = "SELECT ul.logouttime " +
                      "FROM   users_logout ul " +
                      "WHERE  ul.uid = ? " +
                      "ORDER BY ul.logouttime DESC " +
                      "LIMIT 1; ";
    if (!data) {
      data = {
        limit: 100
      }
    } else {
      data.limit = data.limit || 100;
    }

    db.query(historyQuery, socket.uid, (err, user_history) => {
      if (err) {
        throw err;
      }
      
      if (!data.gid) {
        console.log("[ERROR] No Group ID specified!");
      }

      const logouttime = user_history[0] ? user_history[0].logouttime : null;

      let newMessageQuery = "SELECT m.uid, m.gid, m.message, m.time " +
                            "FROM   messages m " +
                            "WHERE  m.gid = ? " + 
                            "LIMIT ?;";
      
      db.query(newMessageQuery, [data.gid, data.limit], (err, newMessages) => {
        if (err) {
          throw err;
        } 
        if (logouttime) {
          newMessages.forEach(element => {
            element.unread = (element.time > logouttime);
          });
        } else { // no logouttime == new user (haven't logged out yet)
          newMessages.forEach(element => {
            element.unread = true;
          })
        }
        
        /* use 'socket' instead of 'io' to send only to target user */
        socket.emit('receivePreviousMessages', newMessages.sort((a, b) => {
          return a.time - b.time; // order by time
        }));
      })
    })
  })


  /* User send chat message => broadcast chat message to all user and store in Chat DB, Message Table */
  socket.on('sendChatMessage', (data) => {
    console.log(getTimeStamp(), " user ", socket.uid, " sendChatMessage");
    let timestamp = getTimeStamp();
    
    const messageObj = {
      uid: socket.uid,
      gid: data.gid,
      message: data.message,
      time: timestamp
    }
    /* Store message in database */
    let historyStoreQuery = "INSERT INTO messages " +
                            "SET ?;";
                  
    db.query(historyStoreQuery, messageObj,(err, result) => {
      if (err) {
        if (err.code === 'ER_NO_REFERENCED_ROW_2') {
          socket.emit('errUnknownGroup');
        } else {
          throw err;
        }
      } else {
        console.log("Saved message: ", data);
        /* Broadcast new Message to all users */
        io.emit('broadcastChatMessage', messageObj)
      }
    })

    
  })

  /* User Disconnects => Keep User Log in Chat DB, User History Table */
  socket.on('disconnect', () => {
    
    console.log(getTimeStamp(), " user ", socket.uid, " disconnect");
    const logoutQuery = "INSERT INTO users_logout " +
                        "SET ?;";
    
    if (socket.uid /* user sign in */) {
      db.query(logoutQuery, {
        uid: socket.uid,
        logouttime: getTimeStamp()
      }, (err, results) => {
        if (err) throw err;

        const index = users.indexOf(socket.uid);
        if (index > -1) {
          users.splice(index, 1);
        }
        console.log("saved logout")
      })
    } else { /* user hasn't even sign in */
      // pass
    }
  })

  function refreshGroups(socket, db) {
    const query = "SELECT B.gid, B.registertime, G.groupname FROM ChatsDB.belongs_to B, ChatsDB.groups G WHERE B.uid = ? AND G.gid = B.gid;";
    if (socket.uid /* user signed in */) {
      db.query(query, socket.uid, (err, results) => {
        if (err) {
          throw err;
        } 

        socket.emit('receiveGroups', results);
      })
    } else {
      socket.emit("errNotLoggedIn");
    }
  }

  function joinGroup(socket, db, gid) {
    const query = "INSERT INTO ChatsDB.belongs_to SET ?;";
    if (socket.uid /* user signed in */) {
      db.query(query, {
        uid: socket.uid,
        gid: gid
      }, (err, results) => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            refreshGroups(socket, db);
          } else if (err.code === 'ER_NO_REFERENCED_ROW_2') {
            socket.emit('errUnknownGroup');
          } else {
            throw err;
          }
        } else {
          refreshGroups(socket, db);
        }
      })
    } else {
      socket.emit("errNotLoggedIn");
    }
  }

  socket.on('getGroups', () => {
    console.log(getTimeStamp(), " user ", socket.uid, " getGroups");
    refreshGroups(socket, db);
  });

  socket.on('joinGroup', (data) => {
    console.log(getTimeStamp(), " user ", socket.uid, " joinGroup");
    joinGroup(socket, db, data.gid);
  })

  socket.on('leaveGroup', (data) => {
    console.log(getTimeStamp(), " user ", socket.uid, " leaveGroup");

    const query = "DELETE FROM ChatsDB.belongs_to WHERE uid = ? AND gid = ?;"
    if (socket.uid /* user signed in */) {
      db.query(query, [
        socket.uid,
        data.gid
      ], (err, results) => {
        if (err) {
          throw err;
        } 
        
        const countMembersInGroupQuery = "SELECT COUNT(uid) AS num FROM ChatsDB.belongs_to WHERE gid = ?;";
        db.query(countMembersInGroupQuery, data.gid, (err, results) => {
          if (err) {
            throw err;
          }
          console.log("Members left = ", results[0]['num']);

        });

        refreshGroups(socket, db);
      })
    } else {
      socket.emit("errNotLoggedIn");
    }
  })

  socket.on('createGroup', (data) => {
    console.log(getTimeStamp(), " user ", socket.uid, " createGroup");
    const query = "INSERT INTO ChatsDB.groups SET ?;"
    if (socket.uid /* user signed in */) {
      new_gid = "gr-" + Math.random().toString(36).substr(2, 9);
      console.log(new_gid, " : ", data.groupname);
      db.query(query, {
        // creator: socket.uid,
        gid: new_gid,
        groupname: data.groupname
      }, (err, results) => {
        if (err) {
          throw err;
        } 
        
        joinGroup(socket, db, new_gid);
      })
    } else {
      socket.emit("errNotLoggedIn");
    }
  })

})

