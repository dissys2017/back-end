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

  /* Get History Request => Return History chat */
  socket.on('getHistory', () => {
    console.log(getTimeStamp(), " user ", socket.uid, " getHistory");
    
    /* Find most recent logout time of user */
    let historyQuery = "SELECT ul.logouttime " +
                       "FROM   users_logout ul " +
                       "WHERE  ul.uid = ? " +
                       "ORDER BY ul.logouttime DESC " +
                       "LIMIT 1; ";
    
    db.query(historyQuery, socket.uid, (err, user_history) => {
      if (err) {
        throw err;
      }
      
      /* Callback used for all cases below */
      let callback = (err, newMessages) => {
        if (err) {
          throw err;
        }
        for (let i = 0 ; i < newMessages.length ;i++) {

          /* use 'socket' instead of 'io' to send only to target user */
          socket.emit('receiveHistory', {
            uid: newMessages[i].uid,
            gid: newMessages[i].gid,
            message: newMessages[i].message,
            timestamp: newMessages[i].time
          })
        }
      }

      if (!user_history[0] /* User haven't logged out even once! */) {
        let newMessageQuery = "SELECT m.uid, m.gid, m.message, m.time " +
                              "FROM   messages m ";
        db.query(newMessageQuery, callback);
      } else {

        /* Find all new chat message for user */
        let newMessageQuery = "SELECT m.uid, m.gid, m.message, m.time " +
                              "FROM   messages m " +
                              "WHERE  m.time < ?;";
        db.query(newMessageQuery, user_history[0].logouttime, callback);
      }
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
      // pass
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
      // pass
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

        refreshGroups(socket, db);
      })
    } else {
      // pass
    }
  })

  socket.on('createGroup', (data) => {
    console.log(getTimeStamp(), " user ", socket.uid, " createGroup");
    const query = "INSERT INTO ChatsDB.groups SET ?;"
    if (socket.uid /* user signed in */) {
      new_gid = shortid.generate();
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
      // pass
    }
  })

})

