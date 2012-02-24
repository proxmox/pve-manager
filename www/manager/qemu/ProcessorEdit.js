Ext.define('PVE.qemu.ProcessorInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.PVE.qemu.ProcessorInputPanel',

    initComponent : function() {
	var me = this;

	me.column1 = [
	    {
		xtype: 'numberfield',
		name: 'sockets',
		minValue: 1,
		maxValue: 4,
		value: '1',
		fieldLabel: 'Sockets',
		allowBlank: false,
		listeners: {
		    change: function(f, value) {
			var sockets = me.down('field[name=sockets]').getValue();
			var cores = me.down('field[name=cores]').getValue();
			me.down('field[name=totalcores]').setValue(sockets*cores);
		    }
		}
	    },
	    {
		xtype: 'numberfield',
		name: 'cores',
		minValue: 1,
		maxValue: 32,
		value: '1',
		fieldLabel: 'Cores',
		allowBlank: false,
		listeners: {
		    change: function(f, value) {
			var sockets = me.down('field[name=sockets]').getValue();
			var cores = me.down('field[name=cores]').getValue();
			me.down('field[name=totalcores]').setValue(sockets*cores);
		    }
		}
	    }
	];


	me.column2 = [
	    {
		xtype: 'CPUModelSelector',
		name: 'cpu',
		value: '',
		fieldLabel: 'CPU type'
	    },
	    {
		xtype: 'displayfield',
		fieldLabel: 'Total cores',
		name: 'totalcores',
		value: '1'
	    }

	];

	me.callParent();
    }
});

Ext.define('PVE.qemu.ProcessorEdit', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;
	
	Ext.apply(me, {
	    subject: gettext('Processors'),
	    items: Ext.create('PVE.qemu.ProcessorInputPanel')
	});

	me.callParent();

	me.load();
    }
});