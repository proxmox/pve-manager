Ext.define('PVE.lxc.RessourceInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.pveLxcResourceInputPanel',

    insideWizard: false,

    initComponent : function() {
	var me = this;

	var labelWidth = 120;

	me.column1 = [
	    {
		xtype: 'numberfield',
		name: 'memory',
		minValue: 32,
		maxValue: 512*1024,
		value: '512',
		step: 32,
		fieldLabel: gettext('Memory') + ' (MB)',
		labelWidth: labelWidth,
		allowBlank: false
	    },
	    {
		xtype: 'numberfield',
		name: 'swap',
		minValue: 0,
		maxValue: 128*1024,
		value: '512',
		step: 32,
		fieldLabel: gettext('Swap') + ' (MB)',
		labelWidth: labelWidth,
		allowBlank: false
	    }
	];

	me.column2 = [
	    {
		xtype: 'numberfield',
		name: 'cpulimit',
		minValue: 0,
		value: '1',
		step: 1,
		fieldLabel: gettext('CPU limit'),
		labelWidth: labelWidth,
		allowBlank: false
	    },
	    {
		xtype: 'numberfield',
		name: 'cpuunits',
		fieldLabel: gettext('CPU units'),
		value: 1024,
		minValue: 8,
		maxValue: 500000,
		labelWidth: labelWidth,
		allowBlank: false
	    }
	];

	me.callParent();
    }
});

Ext.define('PVE.lxc.RessourceEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;
	
	Ext.apply(me, {
	    subject: gettext('Resources'),
	    items: Ext.create('PVE.lxc.RessourceInputPanel')
	});

	me.callParent();

	me.load();
    }
});

/*jslint confusion: true */
Ext.define('PVE.lxc.RessourceView', {
    extend: 'PVE.grid.ObjectGrid',
    alias: ['widget.pveLxcRessourceView'],

    initComponent : function() {
	var me = this;
	var i, confid;

	var nodename = me.pveSelNode.data.node;
	if (!nodename) { 
	    throw "no node name specified";
	}

	var vmid = me.pveSelNode.data.vmid;
	if (!vmid) {
	    throw "no VM ID specified";
	}

	var caps = Ext.state.Manager.get('GuiCap');

	var resEditor = (caps.vms['VM.Config.Memory'] || caps.vms['VM.Config.Disk'] ||
			 caps.vms['VM.Config.CPU']) ? 'PVE.lxc.RessourceEdit' : undefined;


	var rows = {
	    memory: {
		header: gettext('Memory'),
		editor: resEditor,
		never_delete: true,
		renderer: function(value) {
		    return PVE.Utils.format_size(value*1024*1024);
		}
	    },
	    swap: {
		header: gettext('Swap'),
		editor: resEditor,
		never_delete: true,
		renderer: function(value) {
		    return PVE.Utils.format_size(value*1024*1024);
		}
	    },
	    cpulimit: {
		header: gettext('CPU limit'),
		never_delete: true,
		editor: resEditor,
		defaultValue: 1,
		renderer: function(value) {
		    if (value) { return value; };
		    return gettext('unlimited');
		}
	    },
	    cpuunits: {
		header: gettext('CPU units'),
		never_delete: true,
		editor: resEditor,
		defaultValue: 1024
	    }
	};

	var reload = function() {
	    me.rstore.load();
	};

	var baseurl = 'nodes/' + nodename + '/lxc/' + vmid + '/config';

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

	    var editor = rowdef.editor;

	    var win = Ext.create(editor, {
		pveSelNode: me.pveSelNode,
		confid: rec.data.key,
		url: '/api2/extjs/' + baseurl
	    });

	    win.show();
	    win.on('destroy', reload);
	};

	var edit_btn = new PVE.button.Button({
	    text: gettext('Edit'),
	    selModel: sm,
	    disabled: true,
	    enableFn: function(rec) {
		if (!rec) {
		    return false;
		}
		var rowdef = rows[rec.data.key];
		return !!rowdef.editor;
	    },
	    handler: run_editor
	});

	Ext.applyIf(me, {
	    url: '/api2/json/' + baseurl,
	    selModel: sm,
	    cwidth1: 170,
	    tbar: [ edit_btn ],
	    rows: rows,
	    listeners: {
		show: reload,
		itemdblclick: run_editor
	    }
	});

	me.callParent();
    }
});
