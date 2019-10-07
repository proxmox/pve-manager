Ext.define('PVE.form.SpiceEnhancementSelector', {
    extend: 'Proxmox.panel.InputPanel',
    alias: 'widget.pveSpiceEnhancementSelector',
    items: [
	{
	    xtype: 'proxmoxcheckbox',
	    itemId: 'foldersharing',
	    name: 'foldersharing',
	    fieldLabel: 'Folder Sharing',
	    uncheckedValue: 0,
	},
	{
	    xtype: 'proxmoxKVComboBox',
	    itemId: 'videostreaming',
	    name: 'videostreaming',
	    value: 'off',
	    fieldLabel: 'Video Streaming',
	    comboItems: [
		['off', 'off'],
		['all', 'all'],
		['filter', 'filter'],
	    ],
	},
	{
	    xtype: 'displayfield',
	    itemId: 'spicehint',
	    userCls: 'pmx-hint',
	    value: gettext('To use these features set the display to SPICE in the hardware settings of the VM.'),
	    hidden: true,
	}
    ],

    onGetValues: function(values) {
	var ret = {};

	if (values.videostreaming !== "off") {
	    ret.videostreaming = values.videostreaming;
	}
	if (values.foldersharing) {
	    ret.foldersharing = 1;
	}
	if (Ext.Object.isEmpty(ret)) {
	    return { 'delete': 'spice_enhancements' };
	}
	var enhancements = PVE.Parser.printPropertyString(ret);
	return { spice_enhancements: enhancements };
    },

    setValues: function(values) {
	var vga = PVE.Parser.parsePropertyString(values.vga, 'type');
	if (!/^qxl\d?$/.test(vga.type)) {
	    this.down('#spicehint').setVisible(true);
	}
	if (values.spice_enhancements) {
	    var enhancements = PVE.Parser.parsePropertyString(values.spice_enhancements);
	    enhancements['foldersharing'] = PVE.Parser.parseBoolean(enhancements['foldersharing'], 0);
	    this.callParent([enhancements]);
	}
    },
});
