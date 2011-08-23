Ext.ns("PVE");

PVE_vnc_console_event = function(appletid, action, err) {
    //console.log("TESTINIT param1 " + appletid + " action " + action);

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
};

PVE.VNCConsole = Ext.extend(Ext.Panel, {

    initComponent : function() {
	var self = this;

	var myid = self.id + "-vncapp";

	self.appletID = myid;

	//console.log("consoleid " + self.id);

	var resize_window = function() {
	    //console.log("resize");

	    var applet = Ext.getDom(myid);
	    //console.log("resize " + myid + " " + applet);
	    
	    // try again when dom element is available
	    if (!(applet && Ext.isFunction(applet.getPreferredSize))) 
		return resize_window.defer(1000, this);

	    var tbh = self.tbar.getHeight();
	    var ps = applet.getPreferredSize();
	    var aw = ps.width;
	    var ah = ps.height;

	    if (aw < 320) aw = 320;
	    if (ah < 200) ah = 200;

	    var oh;
	    var ow;

	    //console.log("size0 " + aw + " " + ah + " tbh " + tbh);

	    if (this.innerHeight) {
		oh = this.innerHeight;
		ow = this.innerWidth;
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
		try { this.resizeBy(offsetw, offseth); } catch (e) {}
	    }

	    resize_window.defer(1000, this);
	};

 	var box = new Ext.BoxComponent({
	    border: false,
	    html: ""
	});

	var resize_box = function() {
	    var applet = Ext.getDom(myid);
	    // try again when dom element is available
	    if (!(applet && Ext.isFunction(applet.getPreferredSize)))
		return resize_box.defer(1000, this);

	    var ps = applet.getPreferredSize();
	    Ext.fly(applet).setSize(ps.width, ps.height);

	    resize_box.defer(1000, this);
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
	    if (self.toplevel) {
		resize_window.defer(1000, window);
	    } else {
		resize_box.defer(1000, self);
	    }
	};

	self.reloadApplet = function() {
	    Ext.Ajax.request({
		url: self.url,
		params: self.params,
		method: 'POST',
		failure: function(response, opts) {
		    box.update("Error " + response.status + ": " + response.statusText);
		},
		success: function(response, opts) {
		    var obj = Ext.decode(response.responseText);
		    start_vnc_viewer(obj.data);
		}
	    });
	};

	self.on("show", function() { self.reloadApplet();});
	self.on("hide", function() { box.update(""); });

	Ext.apply(self, {
	    layout: 'fit',
	    border: false,
	    autoScroll: self.toplevel ? false : true,
	    items: box
	});

	PVE.VNCConsole.superclass.initComponent.call(self);

    }
});

PVE.Console = Ext.extend(PVE.VNCConsole, {

    initComponent : function() {
	var self = this;

	var vmid = self.vmid;
	var node = self.node;

	if (!vmid)
	    throw "no vmid specified";

	if (!node)
	    throw "no node specified";

	// Hint: we cant display html over the applet (applet z-index bug)
	// So we need to use aller()/confirm() instead of Ext.Msg

	var vm_command = function(cmd, reload_applet) {
	    Ext.Ajax.request({
		url: "/api2/json/nodes/" + node + "/qemu/" + vmid + "/status",
		params: { command: cmd },
		method: 'PUT',
		failure: function(response, opts) {
		    alert("Command '" + cmd + "' failed" +
			"- error " + response.status + ": " 
			  + response.statusText);
		},
		success: function() {
		    if (reload_applet) 
			self.reloadApplet.defer(1000, self);
		}
	    });
	};

	var tbar = [ 
	    { 
		text: 'Start',
		handler: function() { 
		    vm_command("start", 1);
		}
	    }, '-',
	    { 
		text: 'Stop',
		handler: function() {
		    if (confirm("Do you really want to stop the VM?"))
			vm_command("stop"); 
		}
	    }, '-',
	    { 
		text: 'Reset',
		handler: function() { 
		    if (confirm("Do you really want to reset the VM?"))
			vm_command("reset"); 
		}
	    }, '-',
	    { 
		text: 'Shutdown',
		handler: function() {
		    // normally, the OS ask the user
		    //if (confirm("Do you really want to shut down the VM?"))
		    vm_command("shutdown"); 
		}
	    }, '-',
	    { 
		text: 'Suspend',
		handler: function() {
		    if (confirm("Do you really want to suspend the VM?"))
			vm_command("suspend"); 
		}
	    }, '-',
	    { 
		text: 'Resume',
		handler: function() {
		    vm_command("resume"); 
		}
	    },
            '->',
	    {
                text: 'Refresh',
		handler: function() { 
		    var applet = Ext.getDom(self.appletID);
		    applet.sendRefreshRequest();
 		}
	    }, '-',
 	    {
                text: 'Reload',
                handler: function () { self.reloadApplet(); }
	    }, '-',
            { 
                text: 'New Window',
                handler: function() {
		    var url = Ext.urlEncode({
			console: 'kvm',
			vmid: vmid,
			node: node
		    });
                    var nw = window.open("?" + url, '_blank', 
					 "innerWidth=745,innerheight=427");
                    nw.focus();
               }
            }
	];

	Ext.apply(self, {
	    tbar: tbar,
	    url: "/api2/json/nodes/" + node + "/qemu/" + vmid + "/vncproxy",
	    method: 'POST'
	});

	PVE.Console.superclass.initComponent.call(self);
    }
});

Ext.reg('pveConsole', PVE.Console);

PVE.newShellWindow = function(nodename) {
    var url = Ext.urlEncode({
	console: 'shell',
	node: nodename
    });
    var nw = window.open("?" + url, '_blank', "innerWidth=745,innerheight=427");
    nw.focus();
};

PVE.Shell = Ext.extend(PVE.VNCConsole, {

    initComponent : function() {
	var self = this;

	var node = self.node;

	if (!node)
	    throw "no node specified";

	var tbar = [ 
           '->',
	    {
                text: 'Refresh',
		handler: function() { 
		    var applet = Ext.getDom(self.appletID);
		    applet.sendRefreshRequest();
 		}
	    }, '-',
 	    {
                text: 'Reload',
                handler: function () { self.reloadApplet(); }
	    }, '-',
            { 
                text: 'New Window',
                handler: function() {
		    PVE.newShellWindow(node);
		}
            }
	];

	Ext.apply(self, {
	    tbar: tbar,
	    url: "/api2/json/nodes/" + node + "/vncshell"
	});

	PVE.Shell.superclass.initComponent.call(self);
    }
});

Ext.reg('pveShell', PVE.Shell);


