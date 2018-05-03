const express = require('express')
const app = express()
const path = require('path')
const mysql = require('mysql')
const dateFormat = require('dateformat');

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

  function logSocketMethodCall(name) {
    let address = socket.conn.remoteAddress;
    let logMessage = "\x1b[33m[" + getTimeStamp() + "]\x1b[0m \x1b[36m(user " + socket.uid + ")\x1b[0m \x1b[32m(" + address + ")\x1b[0m " + name;
    console.log(logMessage);
  }

  socket.on('login', (data) => {
    // console.log(getTimeStamp(), " user ", socket.uid, " login");
    logSocketMethodCall("login");

    const findUserIdQuery = "SELECT uid FROM ChatsDB.users WHERE username = ? LIMIT 1;"

    db.query(findUserIdQuery, data.username, (err, results) => {
      if (err) {
        throw err;
      }
      if (!results[0]) {

        // Cannot find username in database

        socket.emit('errNoUsername');
      } else {

        // Found username in database

        const uid = results[0]['uid'];

        if (users.includes(uid)) {
          socket.emit('alreadySignedIn');
          socket.disconnect(true);

        } else {
          socket.uid = uid;
          socket.emit('loggedIn');
          users.push(uid);
        }
      }
    })
  })

  /* Get All Messages
   * @param limit (optional, default 100) limit max messages returned by this call
  */
  socket.on('getPreviousMessages', (data) => {
    logSocketMethodCall("getPreviousMessages");
    

    if (!data.gid) {
      console.log("[ERROR] No Group ID specified!");
    }


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
      
      
      const logouttime = user_history[0] ? user_history[0].logouttime : null;

      let newMessageQuery = "SELECT m.uid, u.username, m.gid, m.message, m.time " +
                            "FROM   messages m, users u " +
                            "WHERE  m.gid = ? " + 
                            "AND    m.uid = u.uid " + 
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
    logSocketMethodCall("sendChatMessage");

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

        const userIdToUsernameQuery = "SELECT username FROM ChatsDB.users WHERE uid = ? LIMIT 1;";
        db.query(userIdToUsernameQuery, socket.uid, (err, results) => {
          if (err) {
            throw err;
          }

          messageObj.username = results[0]['username'];

          /* Broadcast new Message to all users */
          io.emit('broadcastChatMessage', messageObj)
        });
      }
    })

    
  })

  /* User Disconnects => Keep User Log in Chat DB, User History Table */
  socket.on('disconnect', () => {
    logSocketMethodCall("disconnect");

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
    logSocketMethodCall("getGroups");

    refreshGroups(socket, db);
  });

  socket.on('joinGroup', (data) => {
    logSocketMethodCall("joinGroup");
    joinGroup(socket, db, data.gid);
  })

  socket.on('leaveGroup', (data) => {
    logSocketMethodCall("leaveGroup");

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
    logSocketMethodCall("createGroup");

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

