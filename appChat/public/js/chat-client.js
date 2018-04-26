const socket = io();

var name = $('#name').val();
socket.emit('getHistory')

socket.on('receiveHistory',function(message) {
    $('#chat-messages').append($('<li>').text(message));
});

socket.on('broadcastChatMessage', function(message) {
    $('#chat-messages').append($('<li>').text(message));
});

$('form').submit(function() {
    name = $('#name').val();
    const message = $('#message').val();
    if(name != '' && message !=''){
       socket.emit('sendChatMessage', `${name} : ${message}`);
    }

    $('#message').val('');  
    
    return false;
});