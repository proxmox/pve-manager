Ext.define('PVE.MenuButton', {
    extend: 'Ext.Button',
    alias: 'widget.pveMenuButton',

    menuPanel: undefined,

    createMenuPanel: function() {
	var me = this;

	var data = me.getMenuItems() || [];

	var addHide = function (fn) {
	    return function () {
		if (me.menuPanel) {
		    me.menuPanel.hide();
		    Ext.Viewport.remove(me.menuPanel);
		    me.menuPanel.destroy();
		    me.menuPanel = undefined;
		}
		return fn.apply(this, arguments);
	    };
	};

	var items = [];

	if (me.getPveStdMenu()) {
	    items.push({
		xtype: 'button',
		ui: 'plain',
		text: gettext('Datacenter'),
		handler: addHide(function() {
		    PVE.Workspace.gotoPage('');
		})
	    });
	}

	data.forEach(function(el) {
	    items.push(Ext.apply(el, {
		xtype: 'button',
		ui: 'plain',
		handler: addHide(el.handler)
	    }));
	});

	if (me.getPveStdMenu()) {
	    items.push({ 
		xtype: 'button',
		ui: 'plain',
		text: gettext('Logout'),
		handler: addHide(function() {
		    PVE.Workspace.showLogin();
		})
	    });
	}

	me.menuPanel = Ext.create('Ext.Panel', {
	    modal: true,
	    hideOnMaskTap: true,
	    visible: false,
	    minWidth: 200,
	    layout: {
		type:'vbox',
		align: 'stretch'
	    },
	    items: items
	});

	PVE.Workspace.history.on('change', function() {
	    if (me.menuPanel) {
		Ext.Viewport.remove(me.menuPanel);
		me.menuPanel.destroy();
		me.menuPanel = undefined;
	    }
	});
    },

    config: {
	menuItems: undefined,
	pveStdMenu: false, // add LOGOUT
	handler:  function() {
	    var me = this;

	    if (!me.menuPanel) {
		me.createMenuPanel();
	    }
	    me.menuPanel.showBy(me, 'tr-bc?');
	}
    },

    initialize: function() {
	var me = this;

        this.callParent();

	if (me.getPveStdMenu()) {
	    me.setIconCls('more');
	}

    }
});
