Ext.define('PVE.window.Wizard', {
    extend: 'Ext.window.Window',

    activeTitle: '', // used for automated testing
    
    getValues: function(dirtyOnly) {
	var me = this;

        var values = {};

	var form = me.down('form').getForm();

        form.getFields().each(function(field) {
            if (!field.up('inputpanel') && (!dirtyOnly || field.isDirty())) {
                PVE.Utils.assemble_field_data(values, field.getSubmitData());
            }
        });

	Ext.Array.each(me.query('inputpanel'), function(panel) {
	    PVE.Utils.assemble_field_data(values, panel.getValues(dirtyOnly));
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


	var tbar = Ext.create('Ext.toolbar.Toolbar', {
            ui: 'footer',
	    region: 'south',
	    margins: '0 5 5 5',
	    items: [  
		{
		    xtype: 'pveHelpButton',
		    itemId: 'help'
		},
		'->', 
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


		    }
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
			
		    }
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
		    }
		}
	    ]
	});

	var display_header = function(newcard) {
	    me.activeTitle = newcard.title;
	    var html = '<h1>' + newcard.title + '</h1>';
	    if (newcard.descr) {
		html += newcard.descr;
	    }
	    me.down('#header').update(html);
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

	    var next = tp.items.indexOf(newcard) + 1;
	    var ntab = tp.items.getAt(next);
	    if (valid && ntab && !newcard.onSubmit) {
		ntab.enable();
	    }
	};

	if (me.subject && !me.title) {
	    me.title = PVE.Utils.dialog_title(me.subject, true, false);
	}

	Ext.apply(me, {
	    width: 700,
	    height: 510,
	    modal: true,
	    border: false,
	    draggable: true,
	    closable: true,
	    resizable: false,
	    layout: 'border',
	    items: [
		{
		    // disabled for now - not really needed
		    hidden: true, 
		    region: 'north',
		    itemId: 'header',
		    layout: 'fit',
		    margins: '5 5 0 5',
		    bodyPadding: 10,
		    html: ''
		},
		{
		    xtype: 'form',
		    region: 'center',
		    layout: 'fit',
		    border: false,
		    margins: '5 5 0 5',
		    fieldDefaults: {
			labelWidth: 100,
			anchor: '100%'
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
				display_header(newcard);
				tabchange(tp, newcard, oldcard);
			    }
			},
			items: tabs
		    }]
		},
		tbar
	    ]
	});
	me.callParent();
	display_header(tabs[0]);

	Ext.Array.each(me.query('field'), function(field) {
	    var validcheck = function() {
		var tp = me.down('#wizcontent');
		var atab = tp.getActiveTab();
		var valid = check_card(atab);
		me.down('#next').setDisabled(!valid);
		me.down('#submit').setDisabled(!valid);    
		var next = tp.items.indexOf(atab) + 1;
		var ntab = tp.items.getAt(next);
		if (!valid) {
		    disable_at(ntab);
		} else if (ntab && !atab.onSubmit) {
		    ntab.enable();
		}
	    };
	    field.on('change', validcheck);
	    field.on('validitychange', validcheck);
	});
    }
});
