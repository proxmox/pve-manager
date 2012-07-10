Ext.define('PVE.qemu.SendKeyMenu', {
    extend: 'Ext.button.Button',
    alias: ['widget.pveQemuSendKeyMenu'],

    initComponent : function() {
        var me = this;

	if (!me.nodename) { 
	    throw "no node name specified";
	}

	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	var sendKey = function(key) {
	    PVE.Utils.API2Request({
		params: { key: key },
		url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + "/sendkey",
		method: 'PUT',
		waitMsgTarget: me,
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		}
	    });
	};

	Ext.apply(me, {
	    text: 'SendKey',
	    menu: new Ext.menu.Menu({
		height: 200,
		items: [
		    {
			text: 'Tab', handler: function() {
			    sendKey('tab');
			}
		    },
		    {
			text: 'Ctrl-Alt-Delete', handler: function() {
			    sendKey('ctrl-alt-delete');
			}
		    },
		    {
			text: 'Ctrl-Alt-Backspace', handler: function() {
			    sendKey('ctrl-alt-backspace');  
		    }
		    },
		    {
			text: 'Ctrl-Alt-F1', handler: function() {
			    sendKey('ctrl-alt-f1');
			}
		    },
		    {
			text: 'Ctrl-Alt-F2', handler: function() {
			    sendKey('ctrl-alt-f2');
			}
		    },
		    {
			text: 'Ctrl-Alt-F3', handler: function() {
			    sendKey('ctrl-alt-f3');
			}
		    },
		    {
			text: 'Ctrl-Alt-F4', handler: function() {
			sendKey('ctrl-alt-f4');
			}
		    },
		    {
			text: 'Ctrl-Alt-F5', handler: function() {
			    sendKey('ctrl-alt-f5');
			}
		    },
		    {
			text: 'Ctrl-Alt-F6', handler: function() {
			    sendKey('ctrl-alt-f6');
			}
		    },
		    {
			text: 'Ctrl-Alt-F7', handler: function() {
			    sendKey('ctrl-alt-f7');
			}
		    },
		    {
			text: 'Ctrl-Alt-F8', handler: function() {
			    sendKey('ctrl-alt-f8');
			}
		    },
		    {
			text: 'Ctrl-Alt-F9', handler: function() {
			    sendKey('ctrl-alt-f9');
			}
		    },
		    {
			text: 'Ctrl-Alt-F10', handler: function() {
			    sendKey('ctrl-alt-f10');
			}
		    },
		    {
			text: 'Ctrl-Alt-F11', handler: function() {
			    sendKey('ctrl-alt-f11');
			}
		    },
		    {
			text: 'Ctrl-Alt-F12', handler: function() {
			    sendKey('ctrl-alt-f12');
			}
		    }
		]
	    })
	});

	me.callParent();
    }
});
