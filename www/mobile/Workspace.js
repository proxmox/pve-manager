Ext.define('PVE.Page', {
    extend: 'Ext.Container',
    alias: 'widget.pvePage',

    statics: {
	pathMatch: function(loc) {
	    throw "implement this in subclass";
	}
    },

   config: {
	layout: 'vbox',
	appUrl: undefined
   }
});

Ext.define('PVE.ErrorPage', {
    extend: 'Ext.Panel',

    config: {
	html: "no such page",
	padding: 10,
	layout: {
	    type: 'vbox',
	    pack: 'center',
	    align: 'stretch'
	},
	items: [
	    {
		xtype: 'pveTitleBar',
		pveReloadButton: false,
		title: gettext('Error')
	    }
	]
    }
});

Ext.define('PVE.Workspace', { statics: {
    // this class only contains static functions

    loginData: null, // Data from last login call

    appWindow: null,

    history: null,

    pages: [ 
	'PVE.LXCMigrate',
	'PVE.LXCSummary',
	'PVE.QemuMigrate',
	'PVE.QemuSummary',
	'PVE.NodeSummary', 
	'PVE.ClusterTaskList',
	'PVE.NodeTaskList',
	'PVE.TaskViewer',
	'PVE.Datacenter'
    ],

    setHistory: function(h) {
	PVE.Workspace.history = h;

	PVE.Workspace.history.setUpdateUrl(true);

	PVE.Workspace.loadPage(PVE.Workspace.history.getToken());
	PVE.Workspace.history.on('change', function(loc) {
	    PVE.Workspace.loadPage(loc);
	});
    },

    goBack: function() {
	var actions = PVE.Workspace.history.getActions(),
	    lastAction = actions[actions.length - 2];

	var url = '';
	if(lastAction) {
	    actions.pop();
	    url = lastAction.getUrl();
	}

	// use loadPage directly so we don't cause new additions to the history
	PVE.Workspace.loadPage(url);
    },

    __setAppWindow: function(comp, dir) {

	var old = PVE.Workspace.appWindow;

	PVE.Workspace.appWindow = comp;

	if (old) {
	    if (dir === 'noanim') {
		Ext.Viewport.setActiveItem(PVE.Workspace.appWindow);
	    } else {
		var anim = { type: 'slide', direction: dir || 'left' };
		Ext.Viewport.animateActiveItem(PVE.Workspace.appWindow, anim);
	    }
	    // remove old after anim (hack, because anim.after does not work in 2.3.1a)
	    Ext.Function.defer(function(){
		if (comp !== old) {
		    Ext.Viewport.remove(old);
		}
	    }, 500);
	} else {
	    Ext.Viewport.setActiveItem(PVE.Workspace.appWindow);
	}
    },

    updateLoginData: function(loginData) {
	PVE.Workspace.loginData = loginData;
	PVE.CSRFPreventionToken = loginData.CSRFPreventionToken;
	PVE.UserName = loginData.username;

	// creates a session cookie (expire = null) 
	// that way the cookie gets deleted after browser window close
	Ext.util.Cookies.set('PVEAuthCookie', loginData.ticket, null, '/', null, true);

	PVE.Workspace.gotoPage('');
    },

    showLogin: function() {
	PVE.Utils.authClear();
	PVE.UserName = null;
	PVE.Workspace.loginData = null;

	PVE.Workspace.gotoPage('');
    },

    gotoPage: function(loc) {
	var match;

	var old = PVE.Workspace.appWindow;

	if (old.getAppUrl) {
	    var old_loc = old.getAppUrl();
	    if (old_loc !== loc) {
		PVE.Workspace.history.add(Ext.create('Ext.app.Action', { url: loc }));
	    } else {
		PVE.Workspace.loadPage(loc);
	    }
	} else {
	    PVE.Workspace.history.add(Ext.create('Ext.app.Action', { url: loc }));
	}
    },

    loadPage: function(loc) {
	loc = loc || '';

	var comp;

	if (!PVE.Utils.authOK()) {
	    comp = Ext.create('PVE.Login', {});
	} else {
	    Ext.Array.each(PVE.Workspace.pages, function(p, index) {
		var c = Ext.ClassManager.get(p);
		var match = c.pathMatch(loc);
		if (match) {
		    comp = Ext.create(p, { appUrl: loc });
		    return false; // stop iteration
		}
	    });
	    if (!comp) {
		comp = Ext.create('PVE.ErrorPage', {});
	    }
	}
	
	PVE.Workspace.__setAppWindow(comp, 'noanim');
    },

    obj_to_kv: function(d, names) {
	var kv = [];
	var done = { digest: 1 };
	var pushItem = function(item) {
	    if (done[item.key]) return;
	    done[item.key] = 1;
	    if (item.value) kv.push(item);
	}

	var keys = Ext.Array.sort(Ext.Object.getKeys(d));
	Ext.Array.each(names, function(k) {
	    if (typeof(k) === 'object') {
		Ext.Array.each(keys, function(n) {
		    if (k.test(n)) {
			pushItem({ key: n, value: d[n] });
		    }
		});
	    } else {

		pushItem({ key: k, value: d[k] });
	    }
	});
	Ext.Array.each(keys, function(k) {
	    pushItem({ key: k, value: d[k] });
	});
	return kv;
    }

}});
