Ext.define('PVE.form.AgentFeatureSelector', {
    extend: 'Proxmox.panel.InputPanel',
    alias: ['widget.pveAgentFeatureSelector'],

    viewModel: {},

    items: [
	{
	    xtype: 'proxmoxcheckbox',
	    boxLabel: gettext('Qemu Agent'),
	    name: 'enabled',
	    reference: 'enabled',
	    uncheckedValue: 0,
	},
	{
	    xtype: 'proxmoxcheckbox',
	    boxLabel: gettext('Run guest-trim after clone disk'),
	    name: 'fstrim_cloned_disks',
	    bind: {
		disabled: '{!enabled.checked}',
	    },
	    disabled: true
	}
    ],

    onGetValues: function(values) {
	var agentstr = PVE.Parser.printPropertyString(values, 'enabled');
	return { agent: agentstr };
    },

    setValues: function(values) {
	var agent = values.agent || '';
	var res = PVE.Parser.parsePropertyString(agent, 'enabled');
	this.callParent([res]);
    }
});
