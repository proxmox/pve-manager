Ext.define('PVE.qemu.CPUOptionsInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.PVE.qemu.CPUOptionsInputPanel',

    onGetValues: function(values) {
	var me = this;

	var delete_array = [];
	
	if (values.vcpus === '') {
	    delete_array.push('vcpus');
	    delete values.vcpus;
	}
	if (values.cpulimit === '' || values.cpulimit == 0) {
	    delete_array.push('cpulimit');
	    delete values.cpulimit;
	}
	if (values.cpuunits === '' || values.cpuunits == 1024) {
	    delete_array.push('cpuunits');
	    delete values.cpuunits;
	}

	if (delete_array.length) {
	    values['delete'] = delete_array.join(',');
	}
	
	return values;
    },
    
    initComponent : function() {
	var me = this;

        var items = [
            {
                xtype: 'numberfield',
                name: 'vcpus',
                minValue: 1,
                maxValue: me.maxvcpus,
                value: '',
                fieldLabel: gettext('Vcpus'),
                allowBlank: true,
                emptyText: me.maxvcpus
            },
            {
                xtype: 'numberfield',
                name: 'cpulimit',
                minValue: 0,
                maxValue: me.maxvcpus,
                value: '',
                step: 1,
                fieldLabel: gettext('CPU limit'),
                allowBlank: true,
                emptyText: gettext('unlimited')
            },
	    {
                xtype: 'numberfield',
                name: 'cpuunits',
                fieldLabel: gettext('CPU units'),
                minValue: 8,
                maxValue: 500000,
                value: 1024,
                allowBlank: true
            }
	];

	me.items = items;

	me.callParent();
    }
});

Ext.define('PVE.qemu.CPUOptions', {
    extend: 'PVE.window.Edit',

    initComponent : function() {
	var me = this;

        var ipanel = Ext.create('PVE.qemu.CPUOptionsInputPanel', {
            maxvcpus: me.maxvcpus,
        });
	
	Ext.apply(me, {
	    subject: gettext('CPU Options'),
	    items: ipanel,
	    width: 150
	});

	me.callParent();

	me.load();
    }
});
