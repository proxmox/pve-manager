/*
 * SafeDestroy window with additional checkboxes for removing a storage on the disk level.
 */
Ext.define('PVE.window.SafeDestroyStorage', {
    extend: 'Proxmox.window.SafeDestroy',
    alias: 'widget.pveSafeDestroyStorage',

    showProgress: true,

    additionalItems: [
	{
	    xtype: 'proxmoxcheckbox',
	    name: 'wipeDisks',
	    reference: 'wipeDisksCheckbox',
	    boxLabel: gettext('Cleanup Disks'),
	    checked: true,
	    autoEl: {
		tag: 'div',
		'data-qtip': gettext('Wipe labels and other left-overs'),
	    },
	},
    ],

    getParams: function() {
	let me = this;

	me.params['cleanup-disks'] = me.lookupReference('wipeDisksCheckbox').checked ? 1 : 0;

	return me.callParent();
    },
});
