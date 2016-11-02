Ext.define('PVE.dc.HttpProxyEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.applyIf(me, {
	    subject: gettext('HTTP proxy'),
	    items: {
		xtype: 'pvetextfield',
		name: 'http_proxy',
		vtype: 'HttpProxy',
		emptyText: PVE.Utils.noneText,
		deleteEmpty: true,
		value: '',
		fieldLabel: gettext('HTTP proxy')
	    }
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.dc.KeyboardEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.applyIf(me, {
	    subject: gettext('Keyboard Layout'),
	    items: {
		xtype: 'VNCKeyboardSelector',
		name: 'keyboard',
		value: '__default__',
		fieldLabel: gettext('Keyboard Layout')
	    }
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.dc.ConsoleViewerEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	var data = [];

	Ext.Array.each(['__default__','vv', 'html5'], function(value) {
	    data.push([value, PVE.Utils.render_console_viewer(value)]);
	});

	Ext.applyIf(me, {
	    subject: gettext('Console Viewer'),
	    items: {
		xtype: 'pveKVComboBox',
		name: 'console',
		value: '__default__',
		fieldLabel: gettext('Console Viewer'),
		comboItems: data
	    }
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.dc.EmailFromEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.applyIf(me, {
	    subject: gettext('Email from address'),
	    items: {
		xtype: 'pvetextfield',
		name: 'email_from',
		vtype: 'pveMail',
		emptyText: 'root@$hostname',
		deleteEmpty: true,
		value: '',
		fieldLabel: gettext('Email from address')
	    }
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.dc.MacPrefixEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.applyIf(me, {
	    subject: gettext('MAC address prefix'),
	    items: {
		xtype: 'pvetextfield',
		name: 'mac_prefix',
		regex: /^[a-f0-9]{2}(?::[a-f0-9]{2}){0,2}:?$/i,
		regexText: gettext('Example') + ': 02:8f',
		emptyText: PVE.Utils.noneText,
		deleteEmpty: true,
		value: '',
		fieldLabel: gettext('MAC address prefix')
	    }
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.dc.OptionView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveDcOptionView'],

    onlineHelp: 'datacenter_configuration_file',

    initComponent : function() {
	var me = this;

	var reload = function() {
	    me.rstore.load();
	};

	var rows = {
	    keyboard: { 
		header: gettext('Keyboard Layout'), 
		editor: 'PVE.dc.KeyboardEdit',
		renderer: PVE.Utils.render_kvm_language,
		required: true 
	    },
	    http_proxy: { 
		header: gettext('HTTP proxy'),
		editor: 'PVE.dc.HttpProxyEdit', 
		required: true,
		renderer: function(value) {
		    if (!value) {
			return PVE.Utils.noneText;
		    }
		    return value;
		}
	    },
	    console: {
		header: gettext('Console Viewer'),
		editor: 'PVE.dc.ConsoleViewerEdit',
		required: true,
		renderer: PVE.Utils.render_console_viewer
	    },
	    email_from: { 
		header: gettext('Email from address'),
		editor: 'PVE.dc.EmailFromEdit', 
		required: true,
		renderer: function(value) {
		    if (!value) {
			return 'root@$hostname';
		    }
		    return value;
		}
	    },
	    mac_prefix: {
		header: gettext('MAC address prefix'),
		editor: 'PVE.dc.MacPrefixEdit',
		required: true,
		renderer: function(value) {
		    if (!value) {
			return PVE.Utils.noneText;
		    }
		    return value;
		}
	    }
	};

	var sm = Ext.create('Ext.selection.RowModel', {});

	var run_editor = function() {
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var rowdef = rows[rec.data.key];
	    if (!rowdef.editor) {
		return;
	    }
	    
	    var win = Ext.create(rowdef.editor, {
		url: "/api2/extjs/cluster/options",
		confid: rec.data.key
	    });
	    win.show();
	    win.on('destroy', reload);
	};

	var edit_btn = new PVE.button.Button({
	    text: gettext('Edit'),
	    disabled: true,
	    selModel: sm,
	    handler: run_editor
	});

	Ext.apply(me, {
	    url: "/api2/json/cluster/options",
	    interval: 1000,
	    selModel: sm,
	    tbar: [ edit_btn ],
	    rows: rows,
	    listeners: {
		itemdblclick: run_editor,
		activate: reload
	    }
	});

	me.callParent();
    }
});
