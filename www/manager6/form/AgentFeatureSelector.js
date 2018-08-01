Ext.define('PVE.form.AgentFeatureSelector', {
    extend: 'Proxmox.panel.InputPanel',
    alias: ['widget.pveAgentFeatureSelector'],

    initComponent: function() {
	var me = this;
	me.items= [
	    {
		xtype: 'proxmoxcheckbox',
		boxLabel: gettext('Qemu Agent'),
		name: 'enabled',
		uncheckedValue: 0,
		listeners: {
		    change: function(f, value, old) {
			var gtcb = me.down('proxmoxcheckbox[name=fstrim_cloned_disks]');
			if (value) {
			    gtcb.setDisabled(false);
			} else {
			    gtcb.setDisabled(true);
			}
		    }
		}
	    },
	    {
		xtype: 'proxmoxcheckbox',
		boxLabel: gettext('Run guest-trim after clone disk'),
		name: 'fstrim_cloned_disks',
		disabled: true
	    }
	];
	me.callParent();
    },

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
