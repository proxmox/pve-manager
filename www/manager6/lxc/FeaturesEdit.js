Ext.define('PVE.lxc.FeaturesInputPanel', {
    extend: 'Proxmox.panel.InputPanel',
    xtype: 'pveLxcFeaturesInputPanel',

    // used to save the mounts fstypes until sending
    mounts: [],

    fstypes: ['nfs', 'cifs'],

    items: [
	{
	    xtype: 'proxmoxcheckbox',
	    fieldLabel: gettext('keyctl'),
	    name: 'keyctl'
	},
	{
	    xtype: 'proxmoxcheckbox',
	    fieldLabel: gettext('Nesting'),
	    name: 'nesting'
	},
	{
	    xtype: 'proxmoxcheckbox',
	    name: 'nfs',
	    fieldLabel: 'NFS'
	},
	{
	    xtype: 'proxmoxcheckbox',
	    name: 'cifs',
	    fieldLabel: 'CIFS'
	}
    ],

    onGetValues: function(values) {
	var me = this;
	var mounts = me.mounts;
	me.fstypes.forEach(function(fs) {
	    if (values[fs]) {
		mounts.push(fs);
	    }
	    delete values[fs];
	});

	if (mounts.length) {
	    values.mount = mounts.join(';');
	}

	var featuresstring = PVE.Parser.printPropertyString(values, undefined);
	if (featuresstring == '') {
	    return { 'delete': 'features' };
	}
	return { features: featuresstring };
    },

    setValues: function(values) {
	var me = this;

	me.down('field[name=keyctl]').setDisabled(!values.unprivileged);

	if (values.features) {
	    var res = PVE.Parser.parsePropertyString(values.features);
	    me.mounts = [];
	    if (res.mount) {
		res.mount.split(/[; ]/).forEach(function(item) {
		    if (me.fstypes.indexOf(item) === -1) {
			me.mounts.push(item);
		    } else {
			res[item] = 1;
		    }
		});
	    }
	    this.callParent([res]);
	}
    }
});

Ext.define('PVE.lxc.FeaturesEdit', {
    extend: 'Proxmox.window.Edit',
    xtype: 'pveLxcFeaturesEdit',

    subject: gettext('Features'),

    items: [{
	xtype: 'pveLxcFeaturesInputPanel'
    }],

    initComponent : function() {
	var me = this;

	me.callParent();

	me.load();
    }
});
