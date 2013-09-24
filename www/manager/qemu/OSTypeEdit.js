Ext.define('PVE.qemu.OSTypeInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.PVE.qemu.OSTypeInputPanel',

    initComponent : function() {
	var me = this;

	me.column1 = [
	    {
		xtype: 'component', 
		html: 'Microsoft Windows', 
		cls:'x-form-check-group-label'
	    },
	    {
		xtype: 'radiofield',
		name: 'ostype',
		inputValue: 'win8'
	    },
	    {
		xtype: 'radiofield',
		name: 'ostype',
		inputValue: 'win7'
	    },
	    {
		xtype: 'radiofield',
		name: 'ostype',
		inputValue: 'w2k8'
	    },
	    {
		xtype: 'radiofield',
		name: 'ostype',
		inputValue: 'wxp'
	    },
	    {
		xtype: 'radiofield',
		name: 'ostype',
		inputValue: 'w2k'
	    }
	];

	me.column2 = [
	    {
		xtype: 'component', 
		html: 'Linux/' + gettext('Other OS types'), 
		cls:'x-form-check-group-label'
	    },
	    {
		xtype: 'radiofield',
		name: 'ostype',
		inputValue: 'l26'
	    },
	    {
		xtype: 'radiofield',
		name: 'ostype',
		inputValue: 'l24'
	    },
	    {
		xtype: 'radiofield',
		name: 'ostype',
		inputValue: 'solaris'
	    },
	    {
		xtype: 'radiofield',
		name: 'ostype',
		inputValue: 'other'
	    }
	];

	Ext.Array.each(me.column1, function(def) {
	    if (def.inputValue) {
		def.boxLabel = PVE.Utils.render_kvm_ostype(def.inputValue);
	    }
	});
	Ext.Array.each(me.column2, function(def) {
	    if (def.inputValue) {
		def.boxLabel = PVE.Utils.render_kvm_ostype(def.inputValue);
	    }
	});

	Ext.apply(me, {
	    useFieldContainer: {
		xtype: 'radiogroup',
		allowBlank: false
	    }
	});

	me.callParent();
    }   
});

Ext.define('PVE.qemu.OSTypeEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;
	
	Ext.apply(me, {
	    subject: 'OS Type',
	    items: Ext.create('PVE.qemu.OSTypeInputPanel')
	});

	me.callParent();

	me.load({
	    success: function(response, options) {
		var value = response.result.data.ostype || 'other';
		me.setValues({ ostype: value});
	    }
	});
    }
});
