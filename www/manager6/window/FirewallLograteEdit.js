Ext.define('PVE.FirewallLograteInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveFirewallLograteInputPanel',

    viewModel: {},

    revalidateBurst: function () {
        this.down('field[name=burst]')?.validate();
    },

    items: [
        {
            xtype: 'proxmoxcheckbox',
            name: 'enable',
            reference: 'enable',
            fieldLabel: gettext('Enable'),
            value: true,
            listeners: {
                change: (field) => field.up('inputpanel').revalidateBurst(),
            },
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
                    value: 1,
                    listeners: {
                        change: (field) => field.up('inputpanel').revalidateBurst(),
                    },
                },
                {
                    xtype: 'box',
                    html: '<div style="margin: auto; padding: 2.5px;"><b>/</b></div>',
                },
                {
                    xtype: 'proxmoxKVComboBox',
                    name: 'unit',
                    comboItems: [
                        ['second', 'second'],
                        ['minute', 'minute'],
                        ['hour', 'hour'],
                        ['day', 'day'],
                    ],
                    allowBlank: false,
                    flex: 1,
                    value: 'second',
                    listeners: {
                        change: (field) => field.up('inputpanel').revalidateBurst(),
                    },
                },
            ],
        },
        {
            xtype: 'numberfield',
            name: 'burst',
            fieldLabel: gettext('Log burst limit'),
            minValue: 1,
            maxValue: 99,
            value: 5,
            validator: function (value) {
                let panel = this.up('inputpanel');
                let rate = panel.down('field[name=rate]').getValue();
                let unit = panel.down('field[name=unit]').getValue();
                if (!panel.down('field[name=enable]').getValue() || !rate || !unit) {
                    return true;
                }

                // same limit as pve-firewall: the kernel stores the duration of the burst in 32
                // bits, at 32000 credits per second
                let unitSeconds = { second: 1, minute: 60, hour: 3600, day: 86400 }[unit];
                let interval = Math.floor((10000 * unitSeconds) / rate);
                let maxCredits = Math.floor(0xffffffff / 32000);
                let maxBurst = Math.floor(((maxCredits + 1) * 10000 - 1) / interval);
                let burst = value === '' ? 5 : Number(value);
                if (burst > maxBurst) {
                    return Ext.String.format(gettext('At most {0} for this rate'), maxBurst);
                }
                return true;
            },
        },
    ],

    onGetValues: function (values) {
        let _me = this;

        let cfg = {
            enable: values.enable !== undefined ? 1 : 0,
            rate: values.rate + '/' + values.unit,
            burst: values.burst,
        };
        let properties = PVE.Parser.printPropertyString(cfg, undefined);
        if (properties === '') {
            return { delete: 'log_ratelimit' };
        }
        return { log_ratelimit: properties };
    },

    setValues: function (values) {
        let me = this;

        let properties = {};
        if (values.log_ratelimit !== undefined) {
            properties = PVE.Parser.parsePropertyString(values.log_ratelimit, 'enable');
            if (properties.rate) {
                let matches = properties.rate.match(/^(\d+)\/(second|minute|hour|day)$/);
                if (matches) {
                    properties.rate = matches[1];
                    properties.unit = matches[2];
                }
            }
        }
        me.callParent([properties]);
    },
});

Ext.define('PVE.FirewallLograteEdit', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveFirewallLograteEdit',

    subject: gettext('Log rate limit'),

    items: [
        {
            xtype: 'pveFirewallLograteInputPanel',
        },
    ],
    autoLoad: true,
});
