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
    throw err;
  }
  console.log("DataBase Connected!");
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
app.use(express.static('public'))

// Router
app.get('/', (req, res) => {
  res.render('index')
})

io.on('connection', (socket) => {
  console.log('a user connected')

  /* Get History Request => Return History chat */
  socket.on('getHistory', () => {
    console.log('show history') 
    
    /* Find most recent logout time of user */
    let historyQuery = "SELECT uh.logouttime " +
                       "FROM   user_history uh " +
                       "WHERE  uh.username = 'name' " +
                       "ORDER BY uh.logouttime DESC " +
                       "LIMIT 1; ";
    
    db.query(historyQuery, (err, user_history) => {
      if (err) {
        throw err;
      }
      console.log(user_history[0].logouttime)

      /* Find all new chat message for user */
      let newMessageQuery = "SELECT ch.user,ch.message " +
                            "FROM   chat_history ch " +
                            "WHERE  ch.timestamp < '" + user_history[0].logouttime + "'; ";

      db.query(newMessageQuery, (err, newMessages) => {
        if (err) {
          throw err;
        }
        for (let i = 0 ; i < newMessages.length ;i++) {
          console.log(newMessages[i].user + " : " + newMessages[i].message)
          io.emit('receiveHistory',newMessages[i].user+" : "+newMessages[i].message)
        }
      })
    })
  })

  /* User send chat message => broadcast chat message to all user and store in Chat DB, Message Table */
  socket.on('sendChatMessage', (message) => {
    let arr = message.split(":");
    let timestamp = getTimeStamp();
    let user = arr[0];
    arr.shift();
    let mes = arr.join(":");

    console.log('user : ', user)
    console.log('message : ', mes)

    /* Store message in database */
    let history = "INSERT INTO chat_history(user,message,timestamp) " +
		              "VALUE 	('" + user + "','" + mes + "','" + timestamp + "');";
    db.query(history, (err, result) => {
      if (err) {
        throw err;
      }
      console.log("saved")
    })

    /* Broadcast new Message to all users */
    io.emit('broadcastChatMessage', user + " : " + mes)
  })

  /* User Disconnects => Keep User Log in Chat DB, User History Table */
  socket.on('disconnect',() =>{
    console.log("logout ")
    var timestamp = getTimeStamp()
    var logout =  "UPDATE user_history "+
                  "SET logouttime='"+timestamp+"'"+
                  "WHERE username='name' ;"
                  db.query(logout,function(err,result){
      if (err) throw err;
      console.log("saved logout")
    })
  })
})

