const express = require('express')
const app = express()
const path = require('path')
const mysql = require('mysql')
const APP_PORT = 5555
const server = app.listen(APP_PORT, () => {
  console.log(`App running on port ${APP_PORT}`)
})
const con = mysql.createConnection({
	host: "localhost",
	user: "root",
	password: "12345",
	database: "chat_db"
})

const io = require('socket.io').listen(server)

function getTimeStamp() {
        var now = new Date();
        return  ((now.getFullYear()) + '-' + (((now.getMonth()+1) < 10) ? ("0" + (now.getMonth()+1)) : (now.getMonth()+1)) + '-' 
        + ((now.getDate() < 10) ? ("0" + now.getDate()) : (now.getDate())) + " " 
        + ((now.getHours() < 10) ? ("0" + now.getHours()) : (now.getHours())) + ':'
        + ((now.getMinutes() < 10) ? ("0" + now.getMinutes()) : (now.getMinutes())) + ':' 
        + ((now.getSeconds() < 10) ? ("0" + now.getSeconds()) : (now.getSeconds())) + '.'
        + ((now.getMilliseconds() < 10 ) ? ("00" + now.getSeconds()) : 
          (now.getMilliseconds() < 100 ) ? ("0" + now.getMilliseconds()):
          (now.getMilliseconds())) 
        );
}
// // ??????? ???????? express ????? render view ??????????? views
// // ?????? template engine ???? pug
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'pug')
app.use(express.static('public'))

app.get('/', (req, res) => {
  res.render('index')
})

con.connect(function(err) {
  if (err) throw err;
  console.log("DataBase Connected!");
})

io.on('connection', (socket) => {
  console.log('a user connected')
  socket.on('history',()=>{
    console.log('show history') 
    var history="SELECT uh.logouttime "+
                "FROM   user_history uh "+
                "WHERE  uh.username = 'name' ;"
    con.query(history,function(err,result,field){
                            if (err) throw err;
                             console.log(result[0].logouttime)
                             var hismes="SELECT ch.user,ch.message "+
                                        "FROM   chat_history ch "+
                                        "WHERE  ch.timestamp < '"+result[0].logouttime+"'; "
                            con.query(hismes,function(err,result2,field2){
                              if (err) throw err;
                              for(var i = 0 ; i < result2.length ;i++){
                                console.log(result2[i].user+" : "+result2[i].message)
                                io.emit('history',result2[i].user+" : "+result2[i].message)
                              }
                              })
                           })
  })
  socket.on('chatter', (message) => {
    var arr=message.split(":")
    var timestamp=getTimeStamp()
    var user=arr[0]
    arr.shift();
    var mes=arr.join(":");
    console.log('user : ', user)
    console.log('message : ', mes)
    var history = "INSERT INTO chat_history(user,message,timestamp) "+
		              "VALUE 	('"+user+"','" +mes+ "','"+timestamp+"');"
    con.query(history,function (errt, result) {
    if (errt) throw errt;
    console.log("saved")
    })
    io.emit('chatter', user+" : "+mes )
  })
  socket.on('disconnect',() =>{
    console.log("logout ")
    var timestamp=getTimeStamp()
    var logout =  "UPDATE user_history "+
                  "SET logouttime='"+timestamp+"'"+
                  "WHERE username='name' ;"
    con.query(logout,function(err,result){
      if (err) throw err;
      console.log("saved logout")
    })
  })
})