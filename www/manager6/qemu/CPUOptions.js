Ext.define('PVE.qemu.CPUOptionsInputPanel', {
    extend: 'PVE.panel.InputPanel',
    alias: 'widget.PVE.qemu.CPUOptionsInputPanel',

    onGetValues: function(values) {
	var me = this;

	PVE.Utils.delete_if_default(values, 'vcpus', '', 0);
	PVE.Utils.delete_if_default(values, 'cpulimit', '0', 0);
	PVE.Utils.delete_if_default(values, 'cpuunits', '1024', 0);

	return values;
    },

    initComponent : function() {
	var me = this;

        var items = [
            {
                xtype: 'pveIntegerField',
                name: 'vcpus',
                minValue: 1,
                maxValue: me.maxvcpus,
                value: '',
                fieldLabel: gettext('VCPUs'),
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
                xtype: 'pveIntegerField',
                name: 'cpuunits',
                fieldLabel: gettext('CPU units'),
                minValue: 8,
                maxValue: 500000,
                value: '1024',
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
            maxvcpus: me.maxvcpus
        });
	
	Ext.apply(me, {
	    subject: gettext('CPU options'),
	    items: [ ipanel ]
	});

	me.callParent();

	me.load();
    }
});
