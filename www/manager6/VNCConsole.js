Ext.define('PVE.noVncConsole', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveNoVncConsole',

    nodename: undefined,

    vmid: undefined,

    consoleType: undefined, // lxc or kvm

    layout: 'fit',

    border: false,

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.consoleType) {
	    throw "no console type specified";
	}

	if (!me.vmid && me.consoleType !== 'shell') {
	    throw "no VM ID specified";
	}

	// always use same iframe, to avoid running several noVnc clients
	// at same time (to avoid performance problems)
	var box = Ext.create('Ext.ux.IFrame', { itemid : "vncconsole" });

	Ext.apply(me, {
	    items: box,
	    listeners: {
		activate: function() {
		    var url = '/?console=' + me.consoleType + '&novnc=1&node=' + me.nodename + '&resize=scale';
		    if (me.vmid) {
			url += '&vmid='+ me.vmid;
		    }
		    box.load(url);
		}
	    }
	});

	me.callParent();
    }
});

Ext.define('PVE.VNCConsole', {
    extend: 'Ext.panel.Panel',
    alias: 'widget.pveVNCConsole',

    last_novnc_state: undefined,
    last_novnc_msg: undefined,

    layout: 'fit',
    border: false,

    detectMigratedVM: function() {
	var me = this;

	if (!me.vmid) {
	    return;
	}

	// try to detect migrated VM
	PVE.Utils.API2Request({
	    url: '/cluster/resources',
	    method: 'GET',
	    success: function(response) {
		var list = response.result.data;
		Ext.Array.each(list, function(item) {
		    if (item.type === 'qemu' && item.vmid == me.vmid) {
			if (item.node !== me.nodename) {
			    me.nodename = item.node;
			    me.url = "/nodes/" + me.nodename + "/" + item.type + "/" + me.vmid + "/vncproxy";
			    me.wsurl = "/nodes/" + me.nodename + "/" + item.type + "/" + me.vmid + "/vncwebsocket";
			    me.reloadApplet();
			}
			return false; // break
		    }
		});
	    }
	});
    },

    initComponent : function() {
	var me = this;

	if (!me.url) {
	    throw "no url specified";
	}

	var myid = me.id + "-vncapp";

	me.appletID = myid;

	var box;

	if (!me.wsurl) {
	    throw "no web socket url specified";
	}
	box = Ext.create('Ext.ux.IFrame', { id: myid });

	var resize_window = function() {
	    //console.log("resize");

	    var aw;
	    var ah;

	    var novnciframe = box.getFrame();
	    // noVNC_canvas
	    var innerDoc = novnciframe.contentDocument || novnciframe.contentWindow.document;
	    aw = innerDoc.getElementById('noVNC_canvas').width;
	    ah = innerDoc.getElementById('noVNC_canvas').height + 8;

	    var novnc_state = innerDoc.getElementById('noVNC_status_state').innerHTML;
	    var novnc_msg = innerDoc.getElementById('noVNC_status_msg').innerHTML;

	    if (novnc_state !== me.last_novnc_state || novnc_msg !== me.last_novnc_msg) {
		me.last_novnc_state = novnc_state;
		me.last_novnc_msg = novnc_msg;

		if (novnc_state !== 'normal') {
		    PVE.Utils.setErrorMask(box, novnc_msg || 'unknown');
		} else {
		    PVE.Utils.setErrorMask(box); // clear mask
		}

		if (novnc_state === 'disconnected') {
		    me.detectMigratedVM();
		}
	    }

	    if (aw < 640) { aw = 640; }
	    if (ah < 400) { ah = 400; }

	    var tbar = me.getDockedItems("[dock=top]")[0];
	    var tbh = tbar ? tbar.getHeight() : 0;

	    var oh;
	    var ow;

	    //console.log("size0 " + aw + " " + ah + " tbh " + tbh);

	    if (window.innerHeight) {
		oh = window.innerHeight;
		ow = window.innerWidth;
	    } else if (document.documentElement &&
		       document.documentElement.clientHeight) {
		oh = document.documentElement.clientHeight;
		ow = document.documentElement.clientWidth;
	    } else if (document.body) {
		oh = document.body.clientHeight;
		ow = document.body.clientWidth;
	    }  else {
		throw "can't get window size";
	    }

	    var offsetw = aw - ow;
	    var offseth = ah + tbh - oh;

	    if (offsetw !== 0 || offseth !== 0) {
		//console.log("try resize by " + offsetw + " " + offseth);
		try { window.resizeBy(offsetw, offseth); } catch (e) {}
	    }

	    Ext.Function.defer(resize_window, 1000);
	};

	var start_vnc_viewer = function(param) {
	    var pveparams = Ext.urlEncode({
		port: param.port,
		vncticket: param.ticket
	    });

	    var urlparams = Ext.urlEncode({
		encrypt: 1,
		path: "api2/json" + me.wsurl + "?" + pveparams,
		password: param.ticket
	    });
	    box.load('/novnc/vnc_pve.html?' + urlparams);

	    Ext.Function.defer(resize_window, 1000);
	};

	Ext.apply(me, {
	    scrollable: me.toplevel ? false : true,
	    items: box,
	    reloadApplet: function() {
		var params = Ext.apply({}, me.params);
		params.websocket = 1;
		PVE.Utils.API2Request({
		    url: me.url,
		    params: params,
		    method: me.method || 'POST',
		    failure: function(response, opts) {
			box.update(gettext('Error') + ' ' + response.htmlStatus);
		    },
		    success: function(response, opts) {
			start_vnc_viewer(response.result.data);
		    }
		});
	    }
	});

	me.callParent();

	if (me.toplevel) {
	    me.on("render", me.reloadApplet);
	} else {
	    me.on("activate", me.reloadApplet);
	    me.on("hide", function() { box.update(""); });
	}
    }
});

Ext.define('PVE.KVMConsole', {
    extend: 'PVE.VNCConsole',
    alias: 'widget.pveKVMConsole',

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	var baseUrl = "/nodes/" + me.nodename + "/qemu/" + me.vmid;

	var vm_command = function(cmd, params, reload_applet) {
	    PVE.Utils.API2Request({
		params: params,
		url: baseUrl + "/status/" + cmd,
		method: 'POST',
		waitMsgTarget: me,
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		},
		success: function() {
		    if (reload_applet) {
			Ext.Function.defer(me.reloadApplet, 1000, me);
		    }
		}
	    });
	};

	var tbar = [
	    {
		text: gettext('Start'),
		handler: function() {
		    vm_command("start", {}, 1);
		}
	    },
	    {
		text: gettext('Shutdown'),
		handler: function() {		    
		    var msg = PVE.Utils.format_task_description('qmshutdown', me.vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			vm_command('shutdown');
		    });
		}
	    },
	    {
		text: gettext('Stop'),
		handler: function() {
		    var msg = PVE.Utils.format_task_description('qmstop', me.vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			vm_command("stop");
		    });
		}
	    },
	    {
		xtype: 'pveQemuSendKeyMenu',
		nodename: me.nodename,
		vmid: me.vmid
	    },
	    {
		text: gettext('Reset'),
		handler: function() {
		    var msg = PVE.Utils.format_task_description('qmreset', me.vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			vm_command("reset");
		    });
		}
	    },
	    {
		text: gettext('Suspend'),
		handler: function() {
		    var msg = PVE.Utils.format_task_description('qmsuspend', me.vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			vm_command("suspend");
		    });
		}
	    },
	    {
		text: gettext('Resume'),
		handler: function() {
		    vm_command("resume");
		}
	    },
	    // Note: no migrate here, because we can't display migrate log
            {
                text: gettext('Console'),
                handler: function() {
		    PVE.Utils.openVNCViewer('kvm', me.vmid, me.nodename, me.vmname);
		}
            },
            '->',
	    {
                text: gettext('Reload'),
                handler: function () {
		    me.reloadApplet();
		}
	    }
	];

	Ext.apply(me, {
	    tbar: tbar,
	    url: baseUrl + "/vncproxy",
	    wsurl: baseUrl + "/vncwebsocket"
	});

	me.callParent();
    }
});

Ext.define('PVE.LxcConsole', {
    extend: 'PVE.VNCConsole',
    alias: 'widget.pveLxcConsole',

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	var baseUrl = "/nodes/" + me.nodename + "/lxc/" + me.vmid;

	var vm_command = function(cmd, params, reload_applet) {
	    PVE.Utils.API2Request({
		params: params,
		url: baseUrl + "/status/" + cmd,
		waitMsgTarget: me,
		method: 'POST',
		failure: function(response, opts) {
		    Ext.Msg.alert('Error', response.htmlStatus);
		},
		success: function() {
		    if (reload_applet) {
			Ext.Function.defer(me.reloadApplet, 1000, me);
		    }
		}
	    });
	};

	var tbar = [
	    {
		text: gettext('Start'),
		handler: function() {
		    vm_command("start");
		}
	    },
	    {
		text: gettext('Shutdown'),
		handler: function() {
		    var msg = PVE.Utils.format_task_description('vzshutdown', me.vmid);		    
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			vm_command("shutdown");
		    });
		}
	    },
	    {
		text: gettext('Stop'),
		handler: function() {
		    var msg = PVE.Utils.format_task_description('vzstop', me.vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			vm_command("stop");
		    });
		}
	    },
	    // Note: no migrate here, because we can't display migrate log
            '->',
	    {
                text: gettext('Reload'),
                handler: function () {
		    me.reloadApplet();
		}
	    }
	];

	Ext.apply(me, {
	    tbar: tbar,
	    url: baseUrl + "/vncproxy",
	    wsurl: baseUrl + "/vncwebsocket"
	});

	me.callParent();
    }
});

Ext.define('PVE.Shell', {
    extend: 'PVE.VNCConsole',
    alias: 'widget.pveShell',

    ugradeSystem: false, // set to true to run "apt-get dist-upgrade"

    initComponent : function() {
	var me = this;

	if (!me.nodename) {
	    throw "no node name specified";
	}

	var tbar = [ '->' ];

	if (!me.ugradeSystem) {
	    // we dont want to restart the upgrade script
	    tbar.push({
                text: gettext('Reload'),
                handler: function () { me.reloadApplet(); }
	    });
	}

	tbar.push({
	    text: gettext('Shell'),
	    handler: function() {
		PVE.Utils.openVNCViewer('shell', undefined, me.nodename, undefined);
	    }
	});

	var baseUrl = "/nodes/" + me.nodename;

	Ext.apply(me, {
	    tbar: tbar,
	    url: baseUrl + "/vncshell",
	    wsurl: baseUrl + "/vncwebsocket"
	});

	if (me.ugradeSystem) {
	    me.params = { upgrade: 1 };
	}

	me.callParent();
    }
});
