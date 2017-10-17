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
	else {
	    // helper for cleaning the content when logging out
	    cont.removeAll();
	}
    },

    selectById: function(nodeid) {
	var me = this;
	var tree = me.down('pveResourceTree');
	tree.selectById(nodeid);
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
	    var version = PVE.VersionInfo.version + '-' + PVE.VersionInfo.release;
	    ui.update('Virtual Environment ' + version);
	} else {
	    ui.update('Virtual Environment');
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
			if (selected.length > 0) {
			    var n = selected[0];
			    var tlckup = {
				root: 'PVE.dc.Config',
				node: 'PVE.node.Config',
				qemu: 'PVE.qemu.Config',
				lxc: 'PVE.lxc.Config',
				storage: 'PVE.storage.Browser',
				pool: 'pvePoolConfig'
			    };
			    var comp = {
				xtype: tlckup[n.data.type || 'root'] || 
				    'pvePanelConfig',
				showSearch: (n.data.id === 'root') ||
				    Ext.isDefined(n.data.groupbyid),
				pveSelNode: n,
				workspace: me,
				viewFilter: selview.getViewFilter()
			    };
			    PVE.curSelectedNode = n;
			    me.setContent(comp);
			}
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
				'<img style="padding-top:4px;padding-right:5px" src="/pve2/images/proxmox_logo.png"/></a>'
			},
			{
			    minWidth: 150,
			    id: 'versioninfo',
			    html: 'Virtual Environment'
			},
			{
			    xtype: 'pveGlobalSearchField',
			    tree: rtree
			},
			{
			    flex: 1
			},
			{
			    pack: 'end',
			    id: 'userinfo',
			    stateful: false
			},
			{
			    xtype: 'button',
			    margin: '0 10 0 3',
			    iconCls: 'fa black fa-gear',
			    userCls: 'pointer',
			    handler: function() {
				var win = Ext.create('PVE.window.Settings');
				win.show();
			    }
			},
			{
			    xtype: 'pveHelpButton',
			    hidden: false,
			    baseCls: 'x-btn',
			    iconCls: 'fa fa-book x-btn-icon-el-default-toolbar-small ',
			    listenToGlobalEvent: false,
			    onlineHelp: 'pve_documentation_index',
			    text: gettext('Documentation'),
			    margin: '0 5 0 0'
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
				PVE.data.ResourceStore.loadData([], false);
				me.showLogin(); 
				me.setContent(null);
				var rt = me.down('pveResourceTree');
				rt.clearTree();

				// empty the stores of the StatusPanel child items
				var statusPanels = Ext.ComponentQuery.query('pveStatusPanel grid');
				Ext.Array.forEach(statusPanels, function(comp) {
				    if (comp.getStore()) {
					comp.getStore().loadData([], false);
				    }
				});
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

	// on resize, center all modal windows
	Ext.on('resize', function(){
	    var wins = Ext.ComponentQuery.query('window[modal]');
	    if (wins.length > 0) {
		wins.forEach(function(win){
		    win.alignTo(me, 'c-c');
		});
	    }
	});
    }
});

