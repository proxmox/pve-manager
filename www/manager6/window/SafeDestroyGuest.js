/*
 * SafeDestroy window with additional checkboxes for removing guests
 */
Ext.define('PVE.window.SafeDestroyGuest', {
    extend: 'Proxmox.window.SafeDestroy',
    alias: 'proxmoxSafeDestroy',

    additionalItems: [
	{
	    xtype: 'proxmoxcheckbox',
	    name: 'purge',
	    reference: 'purgeCheckbox',
	    boxLabel: gettext('Purge'),
	    checked: false,
	    autoEl: {
		tag: 'div',
		'data-qtip': gettext('Remove from replication and backup jobs'),
	    },
	},
    ],

    getParams: function() {
	let me = this;

	const purgeCheckbox = me.lookupReference('purgeCheckbox');
	me.params.purge = purgeCheckbox.checked ? 1 : 0;

	return me.callParent();
    },
});
