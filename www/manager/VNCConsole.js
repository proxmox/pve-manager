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

    initComponent : function() {
	var me = this;

	if (!me.url) {
	    throw "no url specified";
	}

	var myid = me.id + "-vncapp";

	me.appletID = myid;

	var box = Ext.create('Ext.Component', {
	    border: false,
	    html: ""
	});

	var resize_window = function() {
	    //console.log("resize");

	    var applet = Ext.getDom(myid);
	    //console.log("resize " + myid + " " + applet);
	    
	    // try again when dom element is available
	    if (!(applet && Ext.isFunction(applet.getPreferredSize))) {
		return Ext.Function.defer(resize_window, 1000);
	    }

	    var tbar = me.getDockedItems("[dock=top]")[0];
	    var tbh = tbar ? tbar.getHeight() : 0;
	    var ps = applet.getPreferredSize();
	    var aw = ps.width;
	    var ah = ps.height;

	    if (aw < 640) { aw = 640; }
	    if (ah < 400) { ah = 400; }

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

	    Ext.fly(applet).setSize(aw, ah + tbh);

	    var offsetw = aw - ow;
	    var offseth = ah + tbh - oh;

	    if (offsetw !== 0 || offseth !== 0) {
		//console.log("try resize by " + offsetw + " " + offseth);
		try { window.resizeBy(offsetw, offseth); } catch (e) {}
	    }

	    Ext.Function.defer(resize_window, 1000);
	};

	var resize_box = function() {
	    var applet = Ext.getDom(myid);

	    if ((applet && Ext.isFunction(applet.getPreferredSize))) {
		var ps = applet.getPreferredSize();
		Ext.fly(applet).setSize(ps.width, ps.height);
	    }

	    Ext.Function.defer(resize_box, 1000);
	};

	var start_vnc_viewer = function(param) {
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
		PVE.Utils.API2Request({
		    url: me.url,
		    params: me.params,
		    method: me.method || 'POST',
		    failure: function(response, opts) {
			box.update("Error " + response.htmlStatus);
		    },
		    success: function(response, opts) {
			start_vnc_viewer(response.result.data);
		    }
		});
	    }
	});

	me.callParent();

	if (me.toplevel) {
	    me.on("render", function() { me.reloadApplet();});
	} else {
	    me.on("show", function() { me.reloadApplet();});
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

	var vm_command = function(cmd, params, reload_applet) {
	    PVE.Utils.API2Request({
		params: params,
		url: '/nodes/' + me.nodename + '/qemu/' + me.vmid + "/status/" + cmd,
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
		text: gettext('Stop'),
		handler: function() {
		    var msg = Ext.String.format(gettext("Do you really want to stop VM {0}?"), me.vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			vm_command("stop", { timeout: 30});
		    }); 
		}
	    },
	    {
		text: gettext('Migrate'),
		handler: function() {
		    var win = Ext.create('PVE.window.Migrate', {
			vmtype: 'qemu',
			nodename: me.nodename,
			vmid: me.vmid
		    });
		    win.show();
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
		text: gettext('Shutdown'),
		handler: function() {
		    var msg = Ext.String.format(gettext("Do you really want to shutdown VM {0}?"), me.vmid);
		    Ext.Msg.confirm(gettext('Confirm'), msg, function(btn) {
			if (btn !== 'yes') {
			    return;
			}
			vm_command('shutdown', {timeout: 30});
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
	    },
            { 
                text: gettext('Console'),
                handler: function() {
		    var url = Ext.urlEncode({
			console: 'kvm',
			vmid: me.vmid,
			node: me.nodename
		    });
                    var nw = window.open("?" + url, '_blank', 
					 "innerWidth=745,innerheight=427");
                    nw.focus();
		}
            }
	];

	Ext.apply(me, {
	    tbar: tbar,
	    url: "/nodes/" + me.nodename + "/qemu/" + me.vmid + "/vncproxy"
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

	var vm_command = function(cmd, params, reload_applet) {
	    PVE.Utils.API2Request({
		params: params,
		url: '/nodes/' + me.nodename + '/openvz/' + me.vmid + "/status/" + cmd,
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
		    vm_command("start", {}, 1);
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
			vm_command("stop", { fast: 1 });
		    }); 
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
			vm_command("stop");
		    }); 
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
	    },
            { 
                text: gettext('Console'),
                handler: function() {
		    var url = Ext.urlEncode({
			console: 'openvz',
			vmid: me.vmid,
			node: me.nodename
		    });
                    var nw = window.open("?" + url, '_blank', 
					 "innerWidth=745,innerheight=427");
                    nw.focus();
		}
            }
	];

	Ext.apply(me, {
	    tbar: tbar,
	    url: "/nodes/" + me.nodename + "/openvz/" + me.vmid + "/vncproxy"
	});

	me.callParent();
    }
});

Ext.define('PVE.Shell', {
    extend: 'PVE.VNCConsole',
    alias: ['widget.pveShell'],

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
	    },
	    {
                text: gettext('Reload'),
                handler: function () { me.reloadApplet(); }
	    },
	    { 
		text: gettext('Shell'),
		handler: function() {
		    var url = Ext.urlEncode({
			console: 'shell',
			node: me.nodename
		    });
		    var nw = window.open("?" + url, '_blank', 
					 "innerWidth=745,innerheight=427");
		    nw.focus();
		}
	    }
	];

	Ext.apply(me, {
	    tbar: tbar,
	    url: "/nodes/" + me.nodename + "/vncshell"
	});

	me.callParent();
    }
});