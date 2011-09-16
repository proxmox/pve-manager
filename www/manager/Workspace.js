/*
 * Workspace base class
 *
 * popup login window when auth fails (call onLogin handler)
 * update (re-login) ticket every 15 minutes
 *
 */

Ext.define('PVE.Workspace', {
    extend: 'Ext.container.Viewport',
    requires: [	     
	'Ext.tip.*',   
	'PVE.Utils', 
	'PVE.window.LoginWindow'
    ],

    title: 'Proxmox Virtual Environment',

    loginData: null, // Data from last login call

    onLogin: function(loginData) {},

    // private
    updateLoginData: function(loginData) {
	var me = this;
	me.loginData = loginData;
	PVE.CSRFPreventionToken = loginData.CSRFPreventionToken;
	PVE.UserName = loginData.username;
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

	document.title = me.title;

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
			// cookie is automatically updated
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
    requires: [	  
	'PVE.KVMConsole'
    ],

    alias: ['widget.pveConsoleWorkspace'],

    title: 'Proxmox Console',

    initComponent : function() {
	var me = this;

	var param = Ext.Object.fromQueryString(window.location.search);
	var consoleType = me.consoleType || param.console;

	var content;
	if (consoleType === 'kvm') {
	    me.title = "VM " + param.vmid;
	    content = {
		xtype: 'pveKVMConsole',
		vmid: param.vmid,
		nodename: param.node,
		toplevel: true
	    };
	} else if (consoleType === 'shell') {
	    me.title = "node " + param.node + " - Proxmox Shell";
	    content = {
		xtype: 'pveShell',
		nodename: param.node,
		toplevel: true
	    };
	} else {
	    content = {
		border: false,
		bodyPadding: 10,
		html: 'Error: No such console type' 
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
    requires: [	  
	'Ext.History',
	'Ext.state.*',
	'Ext.selection.*',
	'PVE.form.ViewSelector', 
	'PVE.data.ResourceStore',
	'PVE.tree.ResourceTree'
    ],

    alias: ['widget.pveStdWorkspace'],

    // private
    defaultContent: {
	title: 'Nothing selected',
	region: 'center'
    },

    setContent: function(comp) {
	var me = this;
	
	if (!comp) { 
	    comp = me.defaultContent;
	}

	var cont = me.child('#content');
	cont.removeAll(true);
	cont.add(comp);
	cont.doLayout();
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
	}
    },

    updateUserInfo: function() {
	var me = this;

	var ui = me.query('#userinfo')[0];

	if (PVE.UserName) {
	    ui.update('<div class="x-unselectable" style="white-space:nowrap;">You are logged in as "' + PVE.UserName + '"</div>');
	} else {
	    ui.update('');
	}
	ui.doLayout();
    },

    initComponent : function() {
	var me = this;

	Ext.History.init();
	Ext.state.Manager.setProvider(Ext.create('PVE.StateProvider'));

	//document.title = ;

	var selview = new PVE.form.ViewSelector({
	    listeners: {
		select: function(combo, records) { 
		    if (records && records.length) {
			var view = combo.getViewFilter();
			combo.up('pveResourceTree').setViewFilter(view);
		    }
		}
	    }
	});

	var rtree = Ext.createWidget('pveResourceTree', {
	    width: 200,
	    region: 'west',
	    margins: '0 0 0 5',
	    split: true,
	    viewFilter: selview.getViewFilter(),
	    tbar: [ ' ', selview ],
	    selModel: new Ext.selection.TreeModel({
		listeners: {
		    selectionchange: function(sm, selected) {
			var comp;
			var tlckup = {
			    root: 'PVE.dc.Config',
			    node: 'PVE.node.Config',
			    qemu: 'PVE.qemu.Config',
			    storage: 'PVE.storage.Browser'
			};
			
			if (selected.length > 0) {
			    var n = selected[0];
			    comp = { 
				xtype: tlckup[n.data.type || 'root'] || 
				    'PVE.panel.Config',
				layout: { type: 'fit' },
				showSearch: (n.data.id === 'root') ||
				    Ext.isDefined(n.data.groupbyid),
				pveSelNode: n,
				workspace: me,
				viewFilter: selview.getViewFilter()
			    };
			}

			me.setContent(comp);
		    }
		}
	    })
	});

	Ext.apply(me, {
	    layout: { type: 'border' },
	    border: false,
	    items: [
		{
		    region: 'north',
		    height: 30,
		    layout: { 
			type: 'hbox',
			align : 'middle'
		    },
		    baseCls: 'x-plain',		
		    defaults: {
			baseCls: 'x-plain'			
		    },
		    border: false,
		    margins: '2 0 5 0',
		    items: [
			{
			    margins: '0 0 0 4',
			    html: '<a class="x-unselectable" target=_blank href="http://www.proxmox.com">' +
				'<img height=30 width=209 src="/pve2/images/proxmox_logo.png"/></a>'
			},
			{
			    minWidth: 200,
			    flex: 1,
			    html: '<span class="x-panel-header-text">Proxmox Virtual Environment<br>Version ' + PVE.GUIVersion + "</span>"
			},
			{
			    pack: 'end',
			    margins: '8 10 0 10',
			    id: 'userinfo',
			    stateful: false
			},
			{
			    pack: 'end',
			    margins: '3 5 0 0',
			    xtype: 'button',
			    baseCls: 'x-btn',
			    text: "Logout",
			    handler: function() { 
				PVE.data.ResourceStore.stopUpdate();
				me.showLogin(); 
				me.setContent(); 
				var rt = me.down('pveResourceTree');
				rt.clearTree();
			    }
			},
			{
			    pack: 'end',
			    margins: '3 5 0 0',
			    xtype: 'button',
			    baseCls: 'x-btn',
			    text: "Create VM",
			    handler: function() {
				var wiz = Ext.create('PVE.qemu.CreateWizard', {});
				wiz.show();
			    } 
			},
			{
			    pack: 'end',
			    margins: '3 5 0 0',
			    xtype: 'button',
			    baseCls: 'x-btn',
			    text: "Create CT",
			    handler: function() {
				var wiz = Ext.create('PVE.openvz.CreateWizard', {});
				wiz.show();
			    } 
			}
		    ]
		},
		{
		    region: 'center',
		    id: 'content',
		    xtype: 'panel',
		    layout: { type: 'fit' },
		    border: false,
		    stateful: false,
		    margins:'0 5 0 0',
		    items: [ me.defaultContent ]
		},
		rtree,
		{
		    xtype: 'pveStatusPanel',
		    region: 'south',
		    margins:'0 5 5 5',
		    height: 200,       
		    collapsible: true,
		    split:true
		}
	    ]
	});

	me.callParent();

	me.updateUserInfo();
    }
});

