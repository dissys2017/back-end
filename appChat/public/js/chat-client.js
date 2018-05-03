const socket = io();


socket.on('connect', () => {
    let uid = window.prompt("User ID");
    socket.emit('login', {
        uid: parseInt(uid)
    }); 
});

socket.on('loggedIn', () => {
    socket.emit('getGroups');
    socket.emit('getHistory');
})

socket.on('receiveHistory', (data) => {
    // console.log(data);
    $('#chat-messages').append($('<li>').text('User ' + data.uid + "(Group " + data.gid + "): " + data.message));
});

socket.on('broadcastChatMessage', (data) => {
    // console.log(data);
    $('#chat-messages').append($('<li>').text('User ' + data.uid + "(Group" + data.gid + "): " + data.message));
});

socket.on('receiveGroups', (data) => {
    // Clear Existing groups
    $('#chat-groups').empty();

    // Add new groups
    data.forEach(group => {
        $('#chat-groups').append($('<li>').text(group.groupname + "(" + group.gid + ")"));
    });
})

socket.on('alreadySignedIn', (data) => {
    window.alert("Already Signed In!");
})

socket.on('errUnknownGroup', () => {
    window.alert("Unknown Group Requested");
})

$('form').submit(function() {
    const gid = $('#gid').val();
    const message = $('#message').val();
    if(gid !== '' && message !== ''){
        socket.emit('sendChatMessage', {
            gid,
            message
        });
    }

    $('#message').val('');  
    
    return false;
});

$('#createGroup').click(() => {
    let groupname = window.prompt("Group Name");
    socket.emit('createGroup', {
        groupname
    })
})

$('#joinGroup').click(() => {
    let gid = window.prompt("Group ID");
    socket.emit('joinGroup', {
        gid
    })
})

$('#leaveGroup').click(() => {
    let gid = window.prompt("Group ID");
    socket.emit('leaveGroup', {
        gid
    })
})