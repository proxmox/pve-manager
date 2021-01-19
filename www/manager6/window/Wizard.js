Ext.define('PVE.window.Wizard', {
    extend: 'Ext.window.Window',

    activeTitle: '', // used for automated testing

    width: 700,
    height: 510,

    modal: true,
    border: false,

    draggable: true,
    closable: true,
    resizable: false,

    layout: 'border',

    getValues: function(dirtyOnly) {
	var me = this;

        var values = {};

	var form = me.down('form').getForm();

        form.getFields().each(function(field) {
            if (!field.up('inputpanel') && (!dirtyOnly || field.isDirty())) {
                Proxmox.Utils.assemble_field_data(values, field.getSubmitData());
            }
        });

	Ext.Array.each(me.query('inputpanel'), function(panel) {
	    Proxmox.Utils.assemble_field_data(values, panel.getValues(dirtyOnly));
	});

        return values;
    },

    initComponent: function() {
	var me = this;

	var tabs = me.items || [];
	delete me.items;

	/*
	 * Items may have the following functions:
	 * validator(): per tab custom validation
	 * onSubmit(): submit handler
	 * onGetValues(): overwrite getValues results
	 */

	Ext.Array.each(tabs, function(tab) {
	    tab.disabled = true;
	});
	tabs[0].disabled = false;

	var maxidx = 0;
	var curidx = 0;

	var check_card = function(card) {
	    var valid = true;
	    var fields = card.query('field, fieldcontainer');
	    if (card.isXType('fieldcontainer')) {
		fields.unshift(card);
	    }
	    Ext.Array.each(fields, function(field) {
		// Note: not all fielcontainer have isValid()
		if (Ext.isFunction(field.isValid) && !field.isValid()) {
		    valid = false;
		}
	    });

	    if (Ext.isFunction(card.validator)) {
		return card.validator();
	    }

	    return valid;
	};

	var disable_at = function(card) {
	    var tp = me.down('#wizcontent');
	    var idx = tp.items.indexOf(card);
	    for(;idx < tp.items.getCount();idx++) {
		var nc = tp.items.getAt(idx);
		if (nc) {
		    nc.disable();
		}
	    }
	};

	var tabchange = function(tp, newcard, oldcard) {
	    if (newcard.onSubmit) {
		me.down('#next').setVisible(false);
		me.down('#submit').setVisible(true);
	    } else {
		me.down('#next').setVisible(true);
		me.down('#submit').setVisible(false);
	    }
	    var valid = check_card(newcard);
	    me.down('#next').setDisabled(!valid);
	    me.down('#submit').setDisabled(!valid);
	    me.down('#back').setDisabled(tp.items.indexOf(newcard) == 0);

	    var idx = tp.items.indexOf(newcard);
	    if (idx > maxidx) {
		maxidx = idx;
	    }
	    curidx = idx;

	    var next = idx + 1;
	    var ntab = tp.items.getAt(next);
	    if (valid && ntab && !newcard.onSubmit) {
		ntab.enable();
	    }
	};

	if (me.subject && !me.title) {
	    me.title = Proxmox.Utils.dialog_title(me.subject, true, false);
	}

	var sp = Ext.state.Manager.getProvider();
	var advchecked = sp.get('proxmox-advanced-cb');

	Ext.apply(me, {
	    items: [
		{
		    xtype: 'form',
		    region: 'center',
		    layout: 'fit',
		    border: false,
		    margins: '5 5 0 5',
		    fieldDefaults: {
			labelWidth: 100,
			anchor: '100%',
		    },
		    items: [{
			itemId: 'wizcontent',
			xtype: 'tabpanel',
			activeItem: 0,
			bodyPadding: 10,
			listeners: {
			    afterrender: function(tp) {
				var atab = this.getActiveTab();
				tabchange(tp, atab);
			    },
			    tabchange: function(tp, newcard, oldcard) {
				tabchange(tp, newcard, oldcard);
			    },
			},
			items: tabs,
		    }],
		},
	    ],
	    fbar: [
		{
		    xtype: 'proxmoxHelpButton',
		    itemId: 'help',
		},
		'->',
		{
		    xtype: 'proxmoxcheckbox',
		    boxLabelAlign: 'before',
		    boxLabel: gettext('Advanced'),
		    value: advchecked,
		    listeners: {
			change: function(cb, val) {
			    var tp = me.down('#wizcontent');
			    tp.query('inputpanel').forEach(function(ip) {
				ip.setAdvancedVisible(val);
			    });

			    sp.set('proxmox-advanced-cb', val);
			},
		    },
		},
		{
		    text: gettext('Back'),
		    disabled: true,
		    itemId: 'back',
		    minWidth: 60,
		    handler: function() {
			var tp = me.down('#wizcontent');
			var atab = tp.getActiveTab();
			var prev = tp.items.indexOf(atab) - 1;
			if (prev < 0) {
			    return;
			}
			var ntab = tp.items.getAt(prev);
			if (ntab) {
			    tp.setActiveTab(ntab);
			}
		    },
		},
		{
		    text: gettext('Next'),
		    disabled: true,
		    itemId: 'next',
		    minWidth: 60,
		    handler: function() {

			var form = me.down('form').getForm();

			var tp = me.down('#wizcontent');
			var atab = tp.getActiveTab();
			if (!check_card(atab)) {
			    return;
			}

			var next = tp.items.indexOf(atab) + 1;
			var ntab = tp.items.getAt(next);
			if (ntab) {
			    ntab.enable();
			    tp.setActiveTab(ntab);
			}

		    },
		},
		{
		    text: gettext('Finish'),
		    minWidth: 60,
		    hidden: true,
		    itemId: 'submit',
		    handler: function() {
			var tp = me.down('#wizcontent');
			var atab = tp.getActiveTab();
			atab.onSubmit();
		    },
		},
	    ],
	});
	me.callParent();

	Ext.Array.each(me.query('inputpanel'), function(panel) {
	    panel.setAdvancedVisible(advchecked);
	});

	Ext.Array.each(me.query('field'), function(field) {
	    var validcheck = function() {
		var tp = me.down('#wizcontent');

		// check tabs from current to the last enabled for validity
		// since we might have changed a validity on a later one
		var i;
		for (i = curidx; i <= maxidx && i < tp.items.getCount(); i++) {
		    var tab = tp.items.getAt(i);
		    var valid = check_card(tab);

		    // only set the buttons on the current panel
		    if (i === curidx) {
			me.down('#next').setDisabled(!valid);
			me.down('#submit').setDisabled(!valid);
		    }

		    // if a panel is invalid, then disable it and all following,
		    // else enable it and go to the next
		    var ntab = tp.items.getAt(i + 1);
		    if (!valid) {
			disable_at(ntab);
			return;
		    } else if (ntab && !tab.onSubmit) {
			ntab.enable();
		    }
		}
	    };
	    field.on('change', validcheck);
	    field.on('validitychange', validcheck);
	});
    },
});
