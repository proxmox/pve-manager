Ext.define('PVE.dc.PoolEdit', {
    extend: 'Proxmox.window.Edit',
    alias: ['widget.pveDcPoolEdit'],
    mixins: ['Proxmox.Mixin.CBind'],

    subject: gettext('Pool'),

    cbindData: {
	poolid: '',
	isCreate: (cfg) => !cfg.poolid,
    },

    cbind: {
	autoLoad: get => !get('isCreate'),
	url: get => `/api2/extjs/pools/${get('poolid')}`,
	method: get => get('isCreate') ? 'POST' : 'PUT',
    },

    items: [
	{
	    xtype: 'pmxDisplayEditField',
	    fieldLabel: gettext('Name'),
	    cbind: {
		editable: '{isCreate}',
		value: '{poolid}',
	    },
	    name: 'poolid',
	    allowBlank: false,
	},
	{
	    xtype: 'textfield',
	    fieldLabel: gettext('Comment'),
	    name: 'comment',
	    allowBlank: true,
	},
    ],
});
