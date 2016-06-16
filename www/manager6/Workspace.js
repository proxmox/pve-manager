/*
 * Workspace base class
 *
 * popup login window when auth fails (call onLogin handler)
 * update (re-login) ticket every 15 minutes
 *
 */

Ext.define('PVE.Workspace', {
    extend: 'Ext.container.Viewport',

    title: 'Proxmox Virtual Environment',

    loginData: null, // Data from last login call

    onLogin: function(loginData) {},

    // private
    updateLoginData: function(loginData) {
	var me = this;
	me.loginData = loginData;
	PVE.CSRFPreventionToken = loginData.CSRFPreventionToken;
	PVE.UserName = loginData.username;

	if (loginData.cap) {
	    Ext.state.Manager.set('GuiCap', loginData.cap);
	}

	// creates a session cookie (expire = null) 
	// that way the cookie gets deleted after browser window close
	Ext.util.Cookies.set('PVEAuthCookie', loginData.ticket, null, '/', null, true);
	me.onLogin(loginData);
    },

    // private
    showLogin: function() {
	var me = this;

	PVE.Utils.authClear();
	PVE.UserName = null;
	me.loginData = null;

	if (!me.login) {
	    me.login = Ext.create('PVE.window.LoginWindow', {
		handler: function(data) {
		    me.login = null;
		    me.updateLoginData(data);
		    PVE.Utils.checked_command(function() {}); // display subscription status
		}
	    });
	}
	me.onLogin(null);
        me.login.show();
    },

    initComponent : function() {
	var me = this;

	Ext.tip.QuickTipManager.init();

	// fixme: what about other errors
	Ext.Ajax.on('requestexception', function(conn, response, options) {
	    if (response.status == 401) { // auth failure
		me.showLogin();
	    }
	});

	me.callParent();

        if (!PVE.Utils.authOK()) {
	    me.showLogin();
	} else { 
	    if (me.loginData) {
		me.onLogin(me.loginData);
	    }
	}

	Ext.TaskManager.start({
	    run: function() {
		var ticket = PVE.Utils.authOK();
		if (!ticket || !PVE.UserName) {
		    return;
		}

		Ext.Ajax.request({
		    params: { 
			username: PVE.UserName,
			password: ticket
		    },
		    url: '/api2/json/access/ticket',
		    method: 'POST',
		    success: function(response, opts) {
			var obj = Ext.decode(response.responseText);
			me.updateLoginData(obj.data);
		    }
		});
	    },
	    interval: 15*60*1000
	});

    }
});

Ext.define('PVE.ConsoleWorkspace', {
    extend: 'PVE.Workspace',

    alias: ['widget.pveConsoleWorkspace'],

    title: gettext('Console'),

    initComponent : function() {
	// novnc is a string in param
	// but a boolean in content
	/*jslint confusion: true*/
	var me = this;

	var param = Ext.Object.fromQueryString(window.location.search);
	var consoleType = me.consoleType || param.console;

	param.novnc = (param.novnc === '1') ? true : false;

	var content;
	if (consoleType === 'kvm') {
	    me.title = "VM " + param.vmid;
	    if (param.vmname) {
		me.title += " ('" + param.vmname + "')";
	    }
	    content = {
		xtype: 'pveKVMConsole',
		novnc: param.novnc,
		vmid: param.vmid,
		nodename: param.node,
		vmname: param.vmname,
		toplevel: true
	    };
	} else if (consoleType === 'lxc') {
	    me.title = "CT " + param.vmid;
	    if (param.vmname) {
		me.title += " ('" + param.vmname + "')";
	    }
	    content = {
		xtype: 'pveLxcConsole',
		novnc: param.novnc,
		vmid: param.vmid,
		nodename: param.node,
		vmname: param.vmname,
		toplevel: true
	    };
	} else if (consoleType === 'shell') {
	    me.title = "node '" + param.node + "'";
	    content = {
		xtype: 'pveShell',
		novnc: param.novnc,
		nodename: param.node,
		toplevel: true
	    };
	} else if (consoleType === 'upgrade') {
	    me.title = Ext.String.format(gettext('System upgrade on node {0}'), "'" + param.node + "'");
	    content = {
		xtype: 'pveShell',
		novnc: param.novnc,
		nodename: param.node,
		ugradeSystem: true,
		toplevel: true
	    };
	} else {
	    content = {
		border: false,
		bodyPadding: 10,
		html: gettext('Error') + ': No such console type'
	    };
	}

	Ext.apply(me, {
	    layout: { type: 'fit' },
	    border: false,
	    items: [ content ]
	});

	me.callParent();       
    }
});

Ext.define('PVE.StdWorkspace', {
    extend: 'PVE.Workspace',

    alias: ['widget.pveStdWorkspace'],

    // private
    setContent: function(comp) {
	var me = this;
	
	var cont = me.child('#content');

	var lay = cont.getLayout();

	var cur = lay.getActiveItem();

	if (comp) {
	    PVE.Utils.setErrorMask(cont, false);
	    comp.border = false;
	    cont.add(comp);
	    if (cur !== null && lay.getNext()) {
		lay.next();
		var task = Ext.create('Ext.util.DelayedTask', function(){
		    cont.remove(cur);
		});
		task.delay(10);
	    }
	}
	// else {
	    // TODO: display something useful

	    // Note:: error mask has wrong zindex, so we do not
	    // use that - see bug 114
	    // PVE.Utils.setErrorMask(cont, 'nothing selected');
	//}
    },

    selectById: function(nodeid) {
	var me = this;
	var tree = me.down('pveResourceTree');
	tree.selectById(nodeid);
    },

    checkVmMigration: function(record) {
	var me = this;
	var tree = me.down('pveResourceTree');
	tree.checkVmMigration(record);
    },

    onLogin: function(loginData) {
	var me = this;

	me.updateUserInfo();

	if (loginData) {
	    PVE.data.ResourceStore.startUpdate();

	    PVE.Utils.API2Request({
		url: '/version',
		method: 'GET',
		success: function(response) {
		    PVE.VersionInfo = response.result.data;
		    me.updateVersionInfo();
		}
	    });
	}
    },

    updateUserInfo: function() {
	var me = this;

	var ui = me.query('#userinfo')[0];

	if (PVE.UserName) {
	    var msg =  Ext.String.format(gettext("You are logged in as {0}"), "'" + PVE.UserName + "'");
	    ui.update('<div class="x-unselectable" style="white-space:nowrap;">' + msg + '</div>');
	} else {
	    ui.update('');
	}
	ui.updateLayout();
    },

    updateVersionInfo: function() {
	var me = this;

	var ui = me.query('#versioninfo')[0];

	if (PVE.VersionInfo) {
	    var version = PVE.VersionInfo.version + '-' + PVE.VersionInfo.release + '/' +
		PVE.VersionInfo.repoid;
	    ui.update('Proxmox Virtual Environment ' + version);
	} else {
	    ui.update('Proxmox Virtual Environment');
	}
	ui.updateLayout();
    },

    initComponent : function() {
	var me = this;

	Ext.History.init();

	var sprovider = Ext.create('PVE.StateProvider');
	Ext.state.Manager.setProvider(sprovider);

	var selview = Ext.create('PVE.form.ViewSelector');

	var rtree = Ext.createWidget('pveResourceTree', {
	    viewFilter: selview.getViewFilter(),
	    flex: 1,
	    selModel: {
		selType: 'treemodel',
		listeners: {
		    selectionchange: function(sm, selected) {
			var comp;
			var tlckup = {
			    root: 'PVE.dc.Config',
			    node: 'PVE.node.Config',
			    qemu: 'PVE.qemu.Config',
			    lxc: 'PVE.lxc.Config',
			    storage: 'PVE.storage.Browser',
			    pool: 'pvePoolConfig'
			};
			
			if (selected.length > 0) {
			    var n = selected[0];
			    comp = {
				xtype: tlckup[n.data.type || 'root'] || 
				    'pvePanelConfig',
				layout: { type: 'fit' },
				showSearch: (n.data.id === 'root') ||
				    Ext.isDefined(n.data.groupbyid),
				pveSelNode: n,
				workspace: me,
				viewFilter: selview.getViewFilter()
			    };
			    PVE.curSelectedNode = n;
			}

			me.setContent(comp);
		    }
		}
	    }
	});

	selview.on('select', function(combo, records) { 
	    if (records) {
		var view = combo.getViewFilter();
		rtree.setViewFilter(view);
	    }
	});

	var caps = sprovider.get('GuiCap');

	var createVM = Ext.createWidget('button', {
	    pack: 'end',
	    margin: '3 5 0 0',
	    baseCls: 'x-btn',
	    iconCls: 'fa fa-desktop',
	    text: gettext("Create VM"),
	    disabled: !caps.vms['VM.Allocate'],
	    handler: function() {
		var wiz = Ext.create('PVE.qemu.CreateWizard', {});
		wiz.show();
	    } 
	});

	var createCT = Ext.createWidget('button', {
	    pack: 'end',
	    margin: '3 5 0 0',
	    baseCls: 'x-btn',
	    iconCls: 'fa fa-cube',
	    text: gettext("Create CT"),
	    disabled: !caps.vms['VM.Allocate'],
	    handler: function() {
		var wiz = Ext.create('PVE.lxc.CreateWizard', {});
		wiz.show();
	    } 
	});

	sprovider.on('statechange', function(sp, key, value) {
	    if (key === 'GuiCap' && value) {
		caps = value;
		createVM.setDisabled(!caps.vms['VM.Allocate']);
		createCT.setDisabled(!caps.vms['VM.Allocate']);
	    }
	});

	Ext.apply(me, {
	    layout: { type: 'border' },
	    border: false,
	    items: [
		{
		    region: 'north',
		    layout: { 
			type: 'hbox',
			align: 'middle'
		    },
		    baseCls: 'x-plain',		
		    defaults: {
			baseCls: 'x-plain'			
		    },
		    border: false,
		    margin: '2 0 2 5',
		    items: [
			{
			    html: '<a class="x-unselectable" target=_blank href="http://www.proxmox.com">' +
				'<img height=30 width=209 src="/pve2/images/proxmox_logo.png"/></a>'
			},
			{
			    minWidth: 200,
			    flex: 1,
			    id: 'versioninfo',
			    html: 'Proxmox Virtual Environment'
			},
			{
			    pack: 'end',
			    margin: '0 10 0 0',
			    id: 'userinfo',
			    stateful: false
			},
			createVM, 
			createCT,
			{
			    pack: 'end',
			    margin: '0 5 0 0',
			    xtype: 'button',
			    baseCls: 'x-btn',
			    iconCls: 'fa fa-sign-out',
			    text: gettext("Logout"),
			    handler: function() { 
				PVE.data.ResourceStore.stopUpdate();
				me.showLogin(); 
				me.setContent(); 
				var rt = me.down('pveResourceTree');
				rt.clearTree();
			    }
			}
		    ]
		},
		{
		    region: 'center',
		    stateful: true,
		    stateId: 'pvecenter',
		    minWidth: 100,
		    minHeight: 100,
		    id: 'content',
		    xtype: 'container',
		    layout: { type: 'card' },
		    border: false,
		    margin: '0 5 0 0',
		    items: []
		},
		{
		    region: 'west',
		    stateful: true,
		    stateId: 'pvewest',
		    itemId: 'west',
		    xtype: 'container',
		    border: false,
		    layout: { type: 'vbox', align: 'stretch' },
		    margin: '0 0 0 5',
		    split: true,
		    width: 200,
		    items: [ selview, rtree ],
		    listeners: {
			resize: function(panel, width, height) {
			    var viewWidth = me.getSize().width;
			    if (width > viewWidth - 100) {
				panel.setWidth(viewWidth - 100);
			    }
			}
		    }
		},
		{
		    xtype: 'pveStatusPanel',
		    stateful: true,
		    stateId: 'pvesouth',
		    itemId: 'south',
		    region: 'south',
		    margin:'0 5 5 5',
		    title: gettext('Logs'),
		    collapsible: true,
		    header: false,
		    height: 200,
		    split:true,
		    listeners: {
			resize: function(panel, width, height) {
			    console.log('test');
			    var viewHeight = me.getSize().height;
			    if (height > (viewHeight - 150)) {
				panel.setHeight(viewHeight - 150);
			    }
			}
		    }
		}
	    ]
	});

	me.callParent();

	me.updateUserInfo();
    }
});

