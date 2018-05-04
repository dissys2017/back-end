const socket = io();

let messageStore = {};

socket.on('connect', () => {
    let username = window.prompt("Username");
    socket.emit('login', {
        username
    }); 
});

socket.on('errNoUsername', () => {
    let username = window.prompt("No username exists! Please re-enter.");
    socket.emit('login', {
        username
    }); 
})

// Called after log in successful
socket.on('loggedIn', () => {
    console.log("Logged In");
    socket.emit('getGroups');
})

socket.on('receivePreviousMessages', (data) => {
    console.log(data);
    if (data.type === 'all'){
        // clear old store
        messageStore[data.gid] = [];

        // add new messages
        data.newMessages.forEach(d => {
            messageStore[data.gid].push(d);
        });
    } else if (data.type === 'incremental') {
        data.newMessages.forEach(d => {
            messageStore[data.gid].push(d);
        })
    }
    
    // Clear old chat box
    $('#chat-messages').empty();

    // Re-populate chatbox with messages
    messageStore[data.gid].forEach(d => {
        if (d.unread) {
            $('#chat-messages').append($('<li class="message-unread">').text('User ' + d.username + "(Group " + d.gid + "): " + d.message));
        } else {
            $('#chat-messages').append($('<li class="message-read">').text('User ' + d.username + "(Group " + d.gid + "): " + d.message));
        }
    })
});

socket.on('broadcastChatMessage', (data) => {
    // console.log(data);
    $('#chat-messages').append($('<li>').text('User ' + data.username + "(Group" + data.gid + "): " + data.message));
    messageStore[data.gid].push(data);
});

socket.on('receiveGroups', (data) => {
    // Clear Existing groups
    $('#chat-groups').empty();
    
    // Add new groups
    data.forEach(group => {
        let $button = $('<button class="chatGroup" data-gid="' + group.gid + '")>' + group.groupname + "(" + group.gid + ")</button>");
        $button.click(() => {

            let oldGid = $('#gid').val();
            let newGid = group.gid;

            // Fetches previous messages in new group 
            socket.emit('getPreviousMessages', {
                gid : newGid,
                limit: 100
            })

            // Break from current group. Must be after fetch previous message or the 'break' would cause unexpected behavior.
            socket.emit('breakFromGroup', {
                gid: oldGid
            })

            // Set the current gid to new gid
            $('#gid').val(newGid);
        })
        let $li = $('<li>');
        $li.append($button);
        $('#chat-groups').append($li);

        // If not exist in store, create an empty list
        if ( !messageStore[group.gid] ) {
            messageStore[group.gid] = [];
        }
    });
})


// ERRORS //

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