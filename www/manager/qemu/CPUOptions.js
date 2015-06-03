Ext.define('PVE.qemu.CPUOptionsInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.PVE.qemu.CPUOptionsInputPanel',

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
            },
            {
                xtype: 'numberfield',
                name: 'cpulimit',
                minValue: 0,
                maxValue: me.maxvcpus,
                value: '',
                step: 1,
                fieldLabel: gettext('CPU limit'),
                allowBlank: false

            },
	    {
                xtype: 'numberfield',
                name: 'cpuunits',
                fieldLabel: gettext('CPU units'),
                minValue: 8,
                maxValue: 500000,
                value: 1024,
                allowBlank: false
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
