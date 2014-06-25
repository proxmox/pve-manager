PVE_vnc_console_event = function(appletid, action, err) {
    //console.log("TESTINIT param1 " + appletid + " action " + action);

    if (action === "error") {
	var compid = appletid.replace("-vncapp", "");
	var comp = Ext.getCmp(compid);

	if (!comp || !comp.vmid || !comp.toplevel) {
	    return;
	}

	// try to detect migrated VM
	PVE.Utils.API2Request({
	    url: '/cluster/resources',
	    method: 'GET',
	    success: function(response) {
		var list = response.result.data;
		Ext.Array.each(list, function(item) {
		    if (item.type === 'qemu' && item.vmid == comp.vmid) {
			if (item.node !== comp.nodename) {
			    //console.log("MOVED VM to node " + item.node);
			    comp.nodename = item.node;
			    comp.url = "/nodes/" + comp.nodename + "/" + item.type + "/" + comp.vmid + "/vncproxy";
			    //console.log("NEW URL " + comp.url);
			    comp.reloadApplet();
			}
			return false; // break
		    }
		});
	    }
	});
    }

    return;
    /*
      var el = Ext.get(appletid);
      if (!el)
      return;

      if (action === "close") {
      //	el.remove();
      } else if (action === "error") {
      //	console.log("TESTERROR: " + err);
      //	var compid = appletid.replace("-vncapp", "");
      //	var comp = Ext.getCmp(compid);
      }

      //Ext.get('mytestid').remove();
      */

};

Ext.define('PVE.VNCConsole', {
    extend: 'Ext.panel.Panel',
    alias: ['widget.pveVNCConsole'],

    novnc: false,

    initComponent : function() {
	var me = this;

	if (!me.url) {
	    throw "no url specified";
	}

	var myid = me.id + "-vncapp";

	me.appletID = myid;

	var box;

	if (me.novnc) {
	    if (!me.wsurl) {
		throw "no web socket url specified";
	    }
	    box = Ext.create('widget.uxiframe', { id: myid });
	} else {
	    box = Ext.create('Ext.Component', { border: false, html: "" });
	}

	var resize_window = function() {
	    //console.log("resize");

	    var aw;
	    var ah;
	    var applet;

	    if (me.novnc) {
		var novnciframe = box.getFrame();
		// noVNC_canvas
		var innerDoc = novnciframe.contentDocument || novnciframe.contentWindow.document;
		aw = innerDoc.getElementById('noVNC_canvas').width + 8;
		ah = innerDoc.getElementById('noVNC_canvas').height + 8;
	    } else {
		applet = Ext.getDom(myid);
	    
		// try again when dom element is available
		if (!(applet && Ext.isFunction(applet.getPreferredSize))) {
		    return Ext.Function.defer(resize_window, 1000);
		}

		var ps = applet.getPreferredSize();
		aw = ps.width;
		ah = ps.height;
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

	    if (!me.novnc) {
		Ext.fly(applet).setSize(aw, ah + tbh);
	    }

	    var offsetw = aw - ow;
	    var offseth = ah + tbh - oh;

	    if (offsetw !== 0 || offseth !== 0) {
		//console.log("try resize by " + offsetw + " " + offseth);
		try { window.resizeBy(offsetw, offseth); } catch (e) {}
	    }

	    Ext.Function.defer(resize_window, 1000);
	};

	var resize_box = function() {
	    if (me.novnc) {
		throw "implement me";
	    } else {
		var applet = Ext.getDom(myid);

		if ((applet && Ext.isFunction(applet.getPreferredSize))) {
		    var ps = applet.getPreferredSize();
		    Ext.fly(applet).setSize(ps.width, ps.height);
		}
	    }

	    Ext.Function.defer(resize_box, 1000);
	};

	var start_vnc_viewer = function(param) {
	    
	    if (me.novnc) {
		
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
	    
	    } else {

		var cert = param.cert;
		cert = cert.replace(/\n/g, "|");

		box.update({
		    id: myid,
		    border: false,
		    tag: 'applet',
		    code: 'com.tigervnc.vncviewer.VncViewer',
		    archive: '/vncterm/VncViewer.jar',
		    // NOTE: set size to '100%' -  else resize does not work
		    width: "100%",
		    height: "100%", 
		    cn: [
			{tag: 'param', name: 'id', value: myid},
			{tag: 'param', name: 'PORT', value: param.port},
			{tag: 'param', name: 'PASSWORD', value: param.ticket},
			{tag: 'param', name: 'USERNAME', value: param.user},
			{tag: 'param', name: 'Show Controls', value: 'No'},
			{tag: 'param', name: 'Offer Relogin', value: 'No'},
			{tag: 'param', name: 'PVECert', value: cert}
		    ]
		});
	    }

            if (me.toplevel) {
		Ext.Function.defer(resize_window, 1000);
            } else {
		Ext.Function.defer(resize_box, 1000);
            }
	};

	Ext.apply(me, {
	    layout: 'fit',
	    border: false,
	    autoScroll: me.toplevel ? false : true,
	    items: box,
	    reloadApplet: function() {
		var params = Ext.apply({}, me.params);
		if (me.novnc) {
		    params.websocket = 1;
		} 
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
	    me.on("show", me.reloadApplet);
	    me.on("hide", function() { box.update(""); });
	}
    }
});

Ext.define('PVE.KVMConsole', {
    extend: 'PVE.VNCConsole',
    alias: ['widget.pveKVMConsole'],

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
		    var msg = Ext.String.format(gettext("Do you really want to shutdown VM {0}?"), me.vmid);
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
		    var msg = Ext.String.format(gettext("Do you really want to stop VM {0}?"), me.vmid);
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
		    var msg = Ext.String.format(gettext("Do you really want to reset VM {0}?"), me.vmid);
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
		    var msg = Ext.String.format(gettext("Do you really want to suspend VM {0}?"), me.vmid);
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
		    PVE.Utils.openVNCViewer('kvm', me.vmid, me.nodename, me.vmname, me.novnc);
		}
            },
            '->',
	    {
                text: gettext('Refresh'),
		handler: function() { 
		    var applet = Ext.getDom(me.appletID);
		    applet.sendRefreshRequest();
		}
	    },
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

Ext.define('PVE.OpenVZConsole', {
    extend: 'PVE.VNCConsole',
    alias: ['widget.pveOpenVZConsole'],

    initComponent : function() {
	var me = this;
 
	if (!me.nodename) { 
	    throw "no node name specified";
	}

	if (!me.vmid) {
	    throw "no VM ID specified";
	}

	var baseUrl = "/nodes/" + me.nodename + "/openvz/" + me.vmid;
 
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
		    var msg = Ext.String.format(gettext("Do you really want to shutdown VM {0}?"), me.vmid);
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
		    var msg = Ext.String.format(gettext("Do you really want to stop VM {0}?"), me.vmid);
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
                text: gettext('Refresh'),
		handler: function() { 
		    var applet = Ext.getDom(me.appletID);
		    applet.sendRefreshRequest();
		}
	    },
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
    alias: ['widget.pveShell'],

    ugradeSystem: false, // set to true to run "apt-get dist-upgrade"

    initComponent : function() {
	var me = this;
 
	if (!me.nodename) { 
	    throw "no node name specified";
	}

	var tbar = [ 
           '->',
	    {
                text: gettext('Refresh'),
		handler: function() { 
		    var applet = Ext.getDom(me.appletID);
		    applet.sendRefreshRequest();
		}
	    }
	];

	if (!me.ugradeSystem) {
	    // we dont want to restart the upgrade script
	    tbar.push([
		{
                    text: gettext('Reload'),
                    handler: function () { me.reloadApplet(); }
		}]);
	}

	tbar.push([
	    { 
		text: gettext('Shell'),
		handler: function() {
		    PVE.Utils.openVNCViewer('shell', undefined, me.nodename, undefined, me.novnc);
		}
	    }
	]);

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
