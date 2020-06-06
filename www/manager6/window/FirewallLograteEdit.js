Ext.define('PVE.FirewallLograteInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveFirewallLograteInputPanel',

    viewModel: {},

    items: [
	{
	    xtype: 'proxmoxcheckbox',
	    name: 'enable',
	    reference: 'enable',
	    fieldLabel: gettext('Enable'),
	    value: true
	},
	{
	    layout: 'hbox',
	    border: false,
	    items: [
		{
		    xtype: 'numberfield',
		    name: 'rate',
		    fieldLabel: gettext('Log rate limit'),
		    minValue: 1,
		    maxValue: 99,
		    allowBlank: false,
		    flex: 2,
		    value: 1
		},
		{
		    xtype: 'box',
		    html: '<div style="margin: auto; padding: 2.5px;"><b>/</b></div>'
		},
		{
		    xtype: 'proxmoxKVComboBox',
		    name: 'unit',
		    comboItems: [['second', 'second'], ['minute', 'minute'],
			['hour', 'hour'], ['day', 'day']],
		    allowBlank: false,
		    flex: 1,
		    value: 'second'
		}
	    ]
	},
	{
	    xtype: 'numberfield',
	    name: 'burst',
	    fieldLabel: gettext('Log burst limit'),
	    minValue: 1,
	    maxValue: 99,
	    value: 5
	}
    ],

    onGetValues: function(values) {
	var me = this;

	var vals = {};
	vals.enable = values.enable !== undefined ? 1 : 0;
	vals.rate = values.rate + '/' + values.unit;
	vals.burst = values.burst;
	var properties = PVE.Parser.printPropertyString(vals, undefined);
	if (properties == '') {
	    return { 'delete': 'log_ratelimit' };
	}
	return { log_ratelimit: properties };
    },

    setValues: function(values) {
	var me = this;

	var properties = {};
	if (values.log_ratelimit !== undefined) {
	    properties = PVE.Parser.parsePropertyString(values.log_ratelimit, 'enable');
	    if (properties.rate) {
		var matches = properties.rate.match(/^(\d+)\/(second|minute|hour|day)$/);
		if (matches) {
		    properties.rate = matches[1];
		    properties.unit = matches[2];
		}
	    }
	}
	me.callParent([properties]);
    }
});

Ext.define('PVE.FirewallLograteEdit', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveFirewallLograteEdit',

    subject: gettext('Log rate limit'),

    items: [{
	xtype: 'pveFirewallLograteInputPanel'
    }],
    autoLoad: true
});
