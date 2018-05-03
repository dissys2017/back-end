const socket = io();


socket.on('connect', () => {
    let uid = window.prompt("User ID");
    socket.emit('login', {
        uid: parseInt(uid)
    }); 
});

socket.on('loggedIn', () => {
    console.log("Logged In");
    socket.emit('getGroups');
})

socket.on('receivePreviousMessages', (data) => {
    $('#chat-messages').empty();
    data.forEach(datum => {
        if (datum.unread) {
            $('#chat-messages').append($('<li class="message-unread">').text('User ' + datum.uid + "(Group " + datum.gid + "): " + datum.message));
        } else {
            $('#chat-messages').append($('<li class="message-read">').text('User ' + datum.uid + "(Group " + datum.gid + "): " + datum.message));
        }
    });
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
        let $button = $('<button class="chatGroup" data-gid="' + group.gid + '")>' + group.groupname + "(" + group.gid + ")</button>");
        $button.click(() => {
            socket.emit('getPreviousMessages', {
                gid : group.gid,
                limit: 100
            })
            $('#gid').val(group.gid);
        })
        let $li = $('<li>');
        $li.append($button);
        $('#chat-groups').append($li);
    });
})

socket.on('alreadySignedIn', (data) => {
    window.alert("Already Signed In!");
})

socket.on('errUnknownGroup', () => {
    window.alert("Unknown Group Requested");
})

socket.on('errNotLoggedIn', () => {
    window.alert("User is not logged in");
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

$('.chatGroup').click(() => {
    const groupName = $(this).data('gid');
    console.log("Clicked on button ", groupName);
})