Ext.define('PVE.form.AgentFeatureSelector', {
    extend: 'Proxmox.panel.InputPanel',
    alias: ['widget.pveAgentFeatureSelector'],

    viewModel: {},

    items: [
	{
	    xtype: 'proxmoxcheckbox',
	    boxLabel: Ext.String.format(gettext('Use {0}'), 'QEMU Guest Agent'),
	    name: 'enabled',
	    reference: 'enabled',
	    uncheckedValue: 0,
	},
	{
	    xtype: 'proxmoxcheckbox',
	    boxLabel: gettext('Run guest-trim after a disk move or VM migration'),
	    name: 'fstrim_cloned_disks',
	    bind: {
		disabled: '{!enabled.checked}',
	    },
	    disabled: true
	},
	{
	    xtype: 'displayfield',
	    userCls: 'pmx-hint',
	    value: gettext('Make sure the QEMU Guest Agent is installed in the VM'),
	    bind: {
		hidden: '{!enabled.checked}',
	    },
	},
    ],

    advancedItems: [
	{
	    xtype: 'proxmoxKVComboBox',
	    name: 'type',
	    value: '__default__',
	    deleteEmpty: false,
	    fieldLabel: 'Type',
	    comboItems: [
		['__default__', Proxmox.Utils.defaultText + " (VirtIO)"],
		['virtio', 'VirtIO'],
		['isa', 'ISA'],
	    ],
	}
    ],

    onGetValues: function(values) {
	var agentstr = PVE.Parser.printPropertyString(values, 'enabled');
	return { agent: agentstr };
    },

    setValues: function(values) {
	let res = PVE.Parser.parsePropertyString(values.agent, 'enabled');
	this.callParent([res]);
    }
});
