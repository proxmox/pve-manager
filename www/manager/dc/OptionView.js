Ext.define('PVE.dc.HttpProxyEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.applyIf(me, {
	    title: "Edit HTTP proxy settings",
	    items: {
		xtype: 'pvetextfield',
		name: 'http_proxy',
		vtype: 'HttpProxy',
		emptyText: 'Do not use any proxy',
		deleteEmpty: true,
		value: '',
		fieldLabel: 'HTTP proxy'
	    }
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.dc.LanguageEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

	Ext.applyIf(me, {
	    title: "Edit language settings",
	    items: {
		xtype: 'pveLanguageSelector',
		name: 'language',
		value: '',
		fieldLabel: 'Language'
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
	    title: "Edit keyboard settings",
	    items: {
		xtype: 'VNCKeyboardSelector',
		name: 'keyboard',
		value: '',
		fieldLabel: 'Keyboard Layout'
	    }
	});

	me.callParent();

	me.load();
    }
});

Ext.define('PVE.dc.OptionView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveDcOptionView'],

    initComponent : function() {
	var me = this;

	var reload = function() {
	    me.rstore.load();
	};

	var rows = {
	    keyboard: { 
		header: 'Keyboard', 
		editor: 'PVE.dc.KeyboardEdit',
		renderer: PVE.Utils.render_kvm_language,
		required: true 
	    },
	    language: { 
		header: 'GUI language', 
		editor: 'PVE.dc.LanguageEdit',
		renderer: PVE.Utils.render_language,
		required: true 
	    },
	    http_proxy: { 
		header: 'HTTP proxy',
		editor: 'PVE.dc.HttpProxyEdit', 
		required: true,
		renderer: function(value) {
		    if (!value) {
			return "Do not use any proxy";
		    }
		    return value;
		}
	    }
	};

	var run_editor = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];
	    if (!rec) {
		return;
	    }

	    var rowdef = rows[rec.data.key];
	    if (!rowdef.editor) {
		return;
	    }
	    
	    var win = Ext.create(rowdef.editor, {
		url: me.url,
		confid: rec.data.key
	    });
	    win.show();
	    win.on('destroy', reload);
	};

	var edit_btn = new Ext.Button({
	    text: 'Edit',
	    disabled: true,
	    handler: run_editor
	});

	var set_button_status = function() {
	    var sm = me.getSelectionModel();
	    var rec = sm.getSelection()[0];

	    if (!rec) {
		edit_btn.disable();
		return;
	    }
	    var rowdef = rows[rec.data.key];
	    edit_btn.setDisabled(!rowdef.editor);
	};

	Ext.applyIf(me, {
	    url: "/api2/extjs/cluster/options",
	    cwidth1: 130,
	    interval: 1000,
	    tbar: [ edit_btn ],
	    rows: rows,
	    listeners: {
		itemdblclick: run_editor,
		selectionchange: set_button_status
	    }
	});

	me.callParent();

	me.on('show', reload);
    }
});
